"""Wi-Fi connectivity sensor.

Monitors network connectivity changes — detects Wi-Fi disconnect,
reconnect, weak signal, and network interface changes.

Emits SENSOR_EVENT:
  - wifi_disconnected: network interface went down or no route to internet
  - wifi_weak_signal: signal strength below threshold
  - wifi_reconnected: network came back after a disconnect
"""

from __future__ import annotations

import asyncio
import json
import subprocess
import sys
import time
from typing import Any

import websockets

try:
    from hands.protocol import SensorEvent
except ImportError:
    from protocol import SensorEvent

SYNAPSE_URL = "ws://localhost:8765"

WEAK_SIGNAL_DBM = -70  # dBm threshold for "weak" Wi-Fi


# ── Platform-specific connectivity checks ────────────────────────────

def check_connectivity() -> dict[str, Any]:
    """Check current network state. Returns dict with status info."""
    result: dict[str, Any] = {
        "connected": False,
        "ssid": None,
        "signal_dbm": None,
        "interface": None,
    }

    if sys.platform == "win32":
        return _check_windows(result)
    elif sys.platform == "darwin":
        return _check_macos(result)
    else:
        return _check_linux(result)


def _check_windows(result: dict[str, Any]) -> dict[str, Any]:
    try:
        out = _run(["netsh", "wlan", "show", "interfaces"])
        if not out:
            return result

        for line in out.splitlines():
            line = line.strip()
            if line.startswith("SSID") and "BSSID" not in line:
                result["ssid"] = line.split(":", 1)[1].strip()
            elif line.startswith("Signal"):
                pct_str = line.split(":", 1)[1].strip().rstrip("%")
                try:
                    pct = int(pct_str)
                    # Convert percentage to approximate dBm
                    result["signal_dbm"] = int((pct / 2) - 100)
                except ValueError:
                    pass
            elif line.startswith("State"):
                state = line.split(":", 1)[1].strip().lower()
                result["connected"] = state == "connected"
            elif line.startswith("Name"):
                result["interface"] = line.split(":", 1)[1].strip()

    except Exception:
        pass

    # Fallback: ping test
    if not result["connected"]:
        result["connected"] = _ping_test()

    return result


def _check_macos(result: dict[str, Any]) -> dict[str, Any]:
    try:
        # Airport utility
        airport = "/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport"
        out = _run([airport, "-I"])
        if out:
            for line in out.splitlines():
                line = line.strip()
                if line.startswith("SSID:"):
                    result["ssid"] = line.split(":", 1)[1].strip()
                    result["connected"] = True
                elif line.startswith("agrCtlRSSI:"):
                    try:
                        result["signal_dbm"] = int(line.split(":", 1)[1].strip())
                    except ValueError:
                        pass
    except Exception:
        pass

    if not result["connected"]:
        result["connected"] = _ping_test()

    return result


def _check_linux(result: dict[str, Any]) -> dict[str, Any]:
    try:
        # Try iwconfig
        out = _run(["iwconfig"])
        if out:
            for line in out.splitlines():
                if "ESSID:" in line:
                    essid = line.split("ESSID:")[1].strip().strip('"')
                    if essid and essid != "off/any":
                        result["ssid"] = essid
                        result["connected"] = True
                if "Signal level=" in line:
                    sig_part = line.split("Signal level=")[1].split()[0]
                    try:
                        result["signal_dbm"] = int(sig_part.replace("dBm", ""))
                    except ValueError:
                        pass
    except Exception:
        pass

    # Fallback: nmcli
    if not result["connected"]:
        try:
            out = _run(["nmcli", "-t", "-f", "ACTIVE,SSID,SIGNAL", "dev", "wifi"])
            if out:
                for line in out.splitlines():
                    parts = line.split(":")
                    if len(parts) >= 3 and parts[0] == "yes":
                        result["ssid"] = parts[1]
                        result["connected"] = True
                        try:
                            pct = int(parts[2])
                            result["signal_dbm"] = int((pct / 2) - 100)
                        except ValueError:
                            pass
                        break
        except Exception:
            pass

    if not result["connected"]:
        result["connected"] = _ping_test()

    return result


def _ping_test() -> bool:
    """Simple connectivity check via ping."""
    target = "8.8.8.8"
    cmd = ["ping", "-n" if sys.platform == "win32" else "-c", "1",
           "-w" if sys.platform == "win32" else "-W", "2", target]
    try:
        proc = subprocess.run(cmd, capture_output=True, timeout=5)
        return proc.returncode == 0
    except Exception:
        return False


def _run(cmd: list[str]) -> str:
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
        return result.stdout
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return ""


# ── Event detection ──────────────────────────────────────────────────

class WifiWatcher:
    """Stateful watcher that tracks connectivity changes."""

    def __init__(self) -> None:
        self.was_connected: bool | None = None
        self.last_ssid: str | None = None

    def check(self) -> list[SensorEvent]:
        events: list[SensorEvent] = []
        state = check_connectivity()
        now = time.time()

        connected = state["connected"]
        ssid = state["ssid"]
        signal = state["signal_dbm"]

        # Disconnect detection
        if self.was_connected is True and not connected:
            events.append(SensorEvent(
                event_type="wifi_disconnected",
                data={"last_ssid": self.last_ssid, "interface": state["interface"]},
                confidence=0.9,
                timestamp=now,
            ))

        # Reconnect detection
        if self.was_connected is False and connected:
            events.append(SensorEvent(
                event_type="wifi_reconnected",
                data={"ssid": ssid, "interface": state["interface"]},
                confidence=0.9,
                timestamp=now,
            ))

        # Weak signal
        if connected and signal is not None and signal < WEAK_SIGNAL_DBM:
            events.append(SensorEvent(
                event_type="wifi_weak_signal",
                data={"ssid": ssid, "signal_dbm": signal, "threshold": WEAK_SIGNAL_DBM},
                confidence=0.7,
                timestamp=now,
            ))

        # SSID change (roaming)
        if connected and ssid and self.last_ssid and ssid != self.last_ssid:
            events.append(SensorEvent(
                event_type="wifi_ssid_changed",
                data={"old_ssid": self.last_ssid, "new_ssid": ssid},
                confidence=0.85,
                timestamp=now,
            ))

        self.was_connected = connected
        if ssid:
            self.last_ssid = ssid

        return events


def to_message(event: SensorEvent) -> dict[str, Any]:
    return {
        "type": "SENSOR_EVENT",
        "event_type": event.event_type,
        "data": event.data,
        "confidence": event.confidence,
        "timestamp": event.timestamp,
    }


async def watch_wifi(interval_seconds: float = 30.0, url: str = SYNAPSE_URL) -> None:
    """Monitor Wi-Fi connectivity on a timer."""
    watcher = WifiWatcher()
    while True:
        try:
            async with websockets.connect(url) as ws:
                while True:
                    events = watcher.check()
                    for ev in events:
                        await ws.send(json.dumps(to_message(ev)))
                    await asyncio.sleep(interval_seconds)
        except (ConnectionRefusedError, OSError):
            await asyncio.sleep(10)
        except websockets.exceptions.ConnectionClosed:
            await asyncio.sleep(5)
