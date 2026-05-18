"""Shadow Loop — proactive system health monitor.

Runs every `interval` seconds, checks system metrics (disk, CPU, memory,
battery, idle time), and emits SENSOR_EVENT / SILENT_INTENT_EVENT messages
through the Hands WebSocket relay to Atrium.

This is the "always-watching" heartbeat of Parix.
"""

from __future__ import annotations

import asyncio
import json
import logging
import shutil
import sys
import time
from typing import Any

import websockets

try:
    from hands.protocol import SensorEvent, SilentIntentEvent
except ImportError:
    from protocol import SensorEvent, SilentIntentEvent

log = logging.getLogger("parix.shadow")

SYNAPSE_URL = "ws://localhost:8765"

# ── Thresholds ───────────────────────────────────────────────────────────
DISK_LOW_PERCENT = 10          # alert when free space < 10 %
CPU_HIGH_PERCENT = 90          # sustained spike
MEMORY_HIGH_PERCENT = 90       # warn when RAM usage > 90 %
SWAP_HIGH_PERCENT = 80         # warn when swap usage > 80 %
BATTERY_LOW_PERCENT = 15       # low battery alert
UPTIME_LONG_HOURS = 72         # suggest reboot after 3 days


# ── Metric collectors ───────────────────────────────────────────────────

def _disk_usage() -> list[dict[str, Any]]:
    """Return list of mount points where free space is critically low."""
    alerts: list[dict[str, Any]] = []
    try:
        import psutil
        for part in psutil.disk_partitions(all=False):
            try:
                usage = psutil.disk_usage(part.mountpoint)
                free_pct = 100 - usage.percent
                if free_pct < DISK_LOW_PERCENT:
                    alerts.append({
                        "mount": part.mountpoint,
                        "free_pct": round(free_pct, 1),
                        "free_gb": round(usage.free / (1024 ** 3), 2),
                        "total_gb": round(usage.total / (1024 ** 3), 2),
                    })
            except PermissionError:
                pass
    except ImportError:
        # Fallback: check root / home only
        for path in _fallback_mount_paths():
            try:
                total, used, free = shutil.disk_usage(path)
                free_pct = (free / total) * 100
                if free_pct < DISK_LOW_PERCENT:
                    alerts.append({
                        "mount": path,
                        "free_pct": round(free_pct, 1),
                        "free_gb": round(free / (1024 ** 3), 2),
                        "total_gb": round(total / (1024 ** 3), 2),
                    })
            except OSError:
                pass
    return alerts


def _fallback_mount_paths() -> list[str]:
    if sys.platform == "win32":
        import string
        paths = []
        for d in string.ascii_uppercase:
            try:
                shutil.disk_usage(f"{d}:\\")
                paths.append(f"{d}:\\")
            except (FileNotFoundError, OSError):
                pass
        return paths if paths else ["C:\\"]
    return ["/", str(__import__("pathlib").Path.home())]


def _cpu_percent() -> float | None:
    try:
        import psutil
        return psutil.cpu_percent(interval=1)
    except ImportError:
        return None


def _memory_usage() -> dict[str, Any] | None:
    try:
        import psutil
        mem = psutil.virtual_memory()
        result: dict[str, Any] = {
            "used_pct": mem.percent,
            "available_gb": round(mem.available / (1024 ** 3), 2),
        }
        swap = psutil.swap_memory()
        if swap.total > 0:
            result["swap_pct"] = swap.percent
        return result
    except ImportError:
        return None


def _battery_info() -> dict[str, Any] | None:
    try:
        import psutil
        bat = psutil.sensors_battery()
        if bat is None:
            return None
        return {
            "percent": bat.percent,
            "plugged": bat.power_plugged,
            "secs_left": bat.secsleft if bat.secsleft >= 0 else None,
        }
    except (ImportError, AttributeError):
        return None


def _idle_seconds() -> float:
    """Get user idle time in seconds (platform-specific)."""
    try:
        if sys.platform == "win32":
            import ctypes

            class LASTINPUTINFO(ctypes.Structure):
                _fields_ = [("cbSize", ctypes.c_uint), ("dwTime", ctypes.c_uint)]

            lii = LASTINPUTINFO()
            lii.cbSize = ctypes.sizeof(LASTINPUTINFO)
            if ctypes.windll.user32.GetLastInputInfo(ctypes.byref(lii)):
                millis = ctypes.windll.kernel32.GetTickCount() - lii.dwTime
                return millis / 1000.0
        elif sys.platform == "darwin":
            import subprocess
            result = subprocess.run(
                ["ioreg", "-c", "IOHIDSystem"],
                capture_output=True, text=True, timeout=5,
            )
            for line in result.stdout.splitlines():
                if "HIDIdleTime" in line:
                    # Value is in nanoseconds
                    val = line.split("=")[-1].strip()
                    return int(val) / 1_000_000_000
        else:
            # Linux — xprintidle (X11) or read /proc/uptime as approximation
            import subprocess
            result = subprocess.run(
                ["xprintidle"], capture_output=True, text=True, timeout=2,
            )
            if result.returncode == 0:
                return int(result.stdout.strip()) / 1000.0
    except Exception:
        pass
    return 0.0


def _uptime_hours() -> float | None:
    try:
        import psutil
        boot = psutil.boot_time()
        return (time.time() - boot) / 3600
    except ImportError:
        pass
    # Linux fallback
    try:
        with open("/proc/uptime") as f:
            return float(f.read().split()[0]) / 3600
    except (FileNotFoundError, ValueError):
        return None


# ── Event builders ───────────────────────────────────────────────────────

def _sensor(event_type: str, data: dict[str, Any], confidence: float) -> dict[str, Any]:
    return {
        "type": "SENSOR_EVENT",
        "event_type": event_type,
        "data": data,
        "confidence": confidence,
        "timestamp": time.time(),
    }


def _intent(intent_type: str, data: dict[str, Any], confidence: float) -> dict[str, Any]:
    return {
        "type": "SILENT_INTENT_EVENT",
        "intent_type": intent_type,
        "data": data,
        "confidence": confidence,
        "timestamp": time.time(),
    }


# ── Core sweep ───────────────────────────────────────────────────────────

def sweep() -> list[dict[str, Any]]:
    """Run all health checks once, return list of events to emit."""
    events: list[dict[str, Any]] = []

    # 1. Disk space
    disk_alerts = _disk_usage()
    if disk_alerts:
        events.append(_sensor("disk_low", {
            "drives": disk_alerts,
            "os": sys.platform,
        }, confidence=0.95))

    # 2. CPU spike
    cpu = _cpu_percent()
    if cpu is not None and cpu >= CPU_HIGH_PERCENT:
        events.append(_sensor("cpu_high", {
            "percent": cpu,
            "os": sys.platform,
        }, confidence=0.7))

    # 3. Memory pressure
    mem = _memory_usage()
    if mem is not None:
        if mem["used_pct"] >= MEMORY_HIGH_PERCENT:
            events.append(_sensor("memory_high", {
                "used_pct": mem["used_pct"],
                "available_gb": mem["available_gb"],
            }, confidence=0.85))
        if mem.get("swap_pct", 0) >= SWAP_HIGH_PERCENT:
            events.append(_sensor("swap_high", {
                "swap_pct": mem["swap_pct"],
            }, confidence=0.75))

    # 4. Battery low (only when unplugged)
    bat = _battery_info()
    if bat and not bat["plugged"] and bat["percent"] <= BATTERY_LOW_PERCENT:
        events.append(_sensor("battery_low", {
            "percent": bat["percent"],
            "secs_left": bat["secs_left"],
        }, confidence=0.9))

    # 5. Idle + low battery → silent intent (shutdown suggestion)
    idle = _idle_seconds()
    bat_pct = bat["percent"] if bat else None
    if bat_pct is not None and idle >= 1800 and bat_pct < 20:
        events.append(_intent("idle_shutdown", {
            "idle_seconds": idle,
            "battery_percent": bat_pct,
        }, confidence=0.8))

    # 6. Long uptime → suggest reboot
    uptime = _uptime_hours()
    if uptime is not None and uptime >= UPTIME_LONG_HOURS:
        events.append(_intent("long_uptime", {
            "uptime_hours": round(uptime, 1),
            "os": sys.platform,
        }, confidence=0.6))

    # 7. Wi-Fi connectivity (delegate to wifi_watch)
    try:
        from sensors.wifi_watch import WifiWatcher
        if not hasattr(sweep, "_wifi_watcher"):
            sweep._wifi_watcher = WifiWatcher()  # type: ignore[attr-defined]
        for ev in sweep._wifi_watcher.check():  # type: ignore[attr-defined]
            events.append(_sensor(ev.event_type, ev.data, ev.confidence))
    except Exception:
        pass

    # 8. USB devices (delegate to usb_watch)
    try:
        from sensors.usb_watch import UsbWatcher
        if not hasattr(sweep, "_usb_watcher"):
            sweep._usb_watcher = UsbWatcher()  # type: ignore[attr-defined]
        for ev in sweep._usb_watcher.check():  # type: ignore[attr-defined]
            events.append(_sensor(ev.event_type, ev.data, ev.confidence))
    except Exception:
        pass

    # 9. App crashes (delegate to app_crash)
    try:
        from sensors.app_crash import AppCrashWatcher
        if not hasattr(sweep, "_crash_watcher"):
            sweep._crash_watcher = AppCrashWatcher()  # type: ignore[attr-defined]
        for ev in sweep._crash_watcher.check():  # type: ignore[attr-defined]
            events.append(_sensor(ev.event_type, ev.data, ev.confidence))
    except Exception:
        pass

    return events


# ── Async loop ───────────────────────────────────────────────────────────

async def run_shadow_loop(
    interval_seconds: float = 60.0,
    url: str = SYNAPSE_URL,
) -> None:
    """Connect to Synapse and emit health events on a timer."""
    log.info("Shadow loop starting (interval=%.0fs)", interval_seconds)

    while True:
        try:
            async with websockets.connect(url) as ws:
                log.info("Shadow loop connected to %s", url)
                while True:
                    events = sweep()
                    for ev in events:
                        await ws.send(json.dumps(ev))
                        log.info("Emitted %s", ev.get("event_type") or ev.get("intent_type"))
                    await asyncio.sleep(interval_seconds)
        except (ConnectionRefusedError, OSError) as exc:
            log.warning("Shadow loop connection failed (%s), retrying in 10s", exc)
            await asyncio.sleep(10)
        except websockets.exceptions.ConnectionClosed:
            log.warning("Shadow loop disconnected, reconnecting in 5s")
            await asyncio.sleep(5)


def start_shadow_thread(interval: float = 60.0, url: str = SYNAPSE_URL) -> None:
    """Fire-and-forget: launch shadow loop in a background thread with its own event loop."""
    import threading

    def _run() -> None:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(run_shadow_loop(interval, url))

    t = threading.Thread(target=_run, daemon=True, name="shadow-loop")
    t.start()
    log.info("Shadow loop thread started")
