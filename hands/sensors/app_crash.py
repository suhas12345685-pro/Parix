"""Application crash sensor.

Monitors system logs for application crashes, hangs, and unexpected exits.
Platform-specific: Event Log (Windows), Console log (macOS), journalctl (Linux).

Emits SENSOR_EVENT:
  - app_crash: application crashed or faulted
  - app_hang: application stopped responding
  - service_down: a monitored service/process exited
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


# ── Platform-specific crash log readers ──────────────────────────────

def read_recent_crashes(since_seconds: int = 120) -> list[dict[str, Any]]:
    """Read crash/fault events from the last N seconds."""
    if sys.platform == "win32":
        return _read_windows_crashes(since_seconds)
    elif sys.platform == "darwin":
        return _read_macos_crashes(since_seconds)
    else:
        return _read_linux_crashes(since_seconds)


def _read_windows_crashes(since_seconds: int) -> list[dict[str, Any]]:
    """Read from Windows Event Log — Application Error + App Hang."""
    crashes: list[dict[str, Any]] = []
    try:
        # Application Error (event ID 1000) and App Hang (1002)
        ps_cmd = (
            f'Get-WinEvent -FilterHashtable @{{LogName="Application";Id=1000,1002}} '
            f'-MaxEvents 10 -ErrorAction SilentlyContinue | '
            f'Where-Object {{ $_.TimeCreated -gt (Get-Date).AddSeconds(-{since_seconds}) }} | '
            f'Select-Object TimeCreated, Id, Message | ConvertTo-Json -Depth 1'
        )
        out = _run(["powershell", "-NoProfile", "-Command", ps_cmd])
        if not out.strip():
            return crashes

        data = json.loads(out)
        if isinstance(data, dict):
            data = [data]

        for entry in data:
            event_id = entry.get("Id", 0)
            message = str(entry.get("Message", ""))[:500]

            # Extract app name from message
            app_name = "unknown"
            if message:
                # First line usually has the app name
                first_line = message.split("\n")[0].strip()
                if first_line:
                    app_name = first_line[:100]

            crash_type = "app_hang" if event_id == 1002 else "app_crash"
            crashes.append({
                "type": crash_type,
                "app": app_name,
                "event_id": event_id,
                "message": message[:200],
                "timestamp": entry.get("TimeCreated", ""),
            })
    except Exception:
        pass
    return crashes


def _read_macos_crashes(since_seconds: int) -> list[dict[str, Any]]:
    """Read from macOS log for crash reports."""
    crashes: list[dict[str, Any]] = []
    try:
        out = _run([
            "log", "show",
            "--predicate", 'process == "ReportCrash" OR process == "spindump"',
            "--last", f"{since_seconds}s",
            "--style", "compact",
        ])
        for line in out.splitlines():
            if "ReportCrash" in line:
                crashes.append({
                    "type": "app_crash",
                    "app": _extract_between(line, "for", "]") or "unknown",
                    "message": line[:200],
                })
            elif "spindump" in line or "hang" in line.lower():
                crashes.append({
                    "type": "app_hang",
                    "app": _extract_between(line, "for", "]") or "unknown",
                    "message": line[:200],
                })
    except Exception:
        pass
    return crashes


def _read_linux_crashes(since_seconds: int) -> list[dict[str, Any]]:
    """Read from journalctl for segfaults, coredumps, OOM kills."""
    crashes: list[dict[str, Any]] = []
    try:
        out = _run([
            "journalctl",
            "--since", f"{since_seconds} seconds ago",
            "--no-pager",
            "-p", "err",  # error priority and above
            "-o", "short",
        ])
        for line in out.splitlines():
            lower = line.lower()
            if "segfault" in lower or "core dumped" in lower:
                crashes.append({
                    "type": "app_crash",
                    "app": _extract_process_name(line),
                    "message": line[:200],
                })
            elif "oom-kill" in lower or "out of memory" in lower:
                crashes.append({
                    "type": "app_crash",
                    "app": _extract_process_name(line),
                    "message": line[:200],
                    "oom": True,
                })
            elif "service" in lower and ("failed" in lower or "exited" in lower):
                crashes.append({
                    "type": "service_down",
                    "app": _extract_service_name(line),
                    "message": line[:200],
                })
    except Exception:
        pass
    return crashes


# ── Process monitoring ───────────────────────────────────────────────

class ProcessWatcher:
    """Watch specific processes and detect when they exit."""

    def __init__(self, watch_list: list[str] | None = None) -> None:
        self.watch_list = watch_list or []
        self.known_pids: dict[str, set[int]] = {}
        self.initialized = False

    def check(self) -> list[SensorEvent]:
        if not self.watch_list:
            return []

        events: list[SensorEvent] = []
        now = time.time()

        for proc_name in self.watch_list:
            current_pids = _find_pids(proc_name)

            if not self.initialized:
                self.known_pids[proc_name] = current_pids
                continue

            prev_pids = self.known_pids.get(proc_name, set())

            # Process disappeared
            if prev_pids and not current_pids:
                events.append(SensorEvent(
                    event_type="service_down",
                    data={
                        "service_name": proc_name,
                        "previous_pids": list(prev_pids),
                    },
                    confidence=0.85,
                    timestamp=now,
                ))

            self.known_pids[proc_name] = current_pids

        self.initialized = True
        return events


def _find_pids(name: str) -> set[int]:
    """Find PIDs of a process by name."""
    pids: set[int] = set()
    try:
        if sys.platform == "win32":
            out = _run(["tasklist", "/FI", f"IMAGENAME eq {name}*", "/FO", "CSV", "/NH"])
            for line in out.splitlines():
                parts = line.strip('"').split('","')
                if len(parts) >= 2:
                    try:
                        pids.add(int(parts[1]))
                    except ValueError:
                        pass
        else:
            out = _run(["pgrep", "-f", name])
            for line in out.splitlines():
                try:
                    pids.add(int(line.strip()))
                except ValueError:
                    pass
    except Exception:
        pass
    return set(pids)


# ── Event builder ────────────────────────────────────────────────────

class AppCrashWatcher:
    """Combines log-based crash detection with process monitoring."""

    def __init__(self, watch_processes: list[str] | None = None) -> None:
        self.seen_messages: set[str] = set()
        self.process_watcher = ProcessWatcher(watch_processes)

    def check(self, since_seconds: int = 120) -> list[SensorEvent]:
        events: list[SensorEvent] = []
        now = time.time()

        # Log-based crashes
        for crash in read_recent_crashes(since_seconds):
            # Deduplicate by message
            key = f"{crash['type']}:{crash.get('app', '')}:{crash.get('message', '')[:50]}"
            if key in self.seen_messages:
                continue
            self.seen_messages.add(key)

            # Prune old entries (keep last 500)
            if len(self.seen_messages) > 500:
                self.seen_messages = set(list(self.seen_messages)[-250:])

            events.append(SensorEvent(
                event_type=crash["type"],
                data={
                    "app": crash.get("app", "unknown"),
                    "message": crash.get("message", ""),
                    "oom": crash.get("oom", False),
                },
                confidence=0.85,
                timestamp=now,
            ))

        # Process monitoring
        events.extend(self.process_watcher.check())

        return events


def to_message(event: SensorEvent) -> dict[str, Any]:
    return {
        "type": "SENSOR_EVENT",
        "event_type": event.event_type,
        "data": event.data,
        "confidence": event.confidence,
        "timestamp": event.timestamp,
    }


async def watch_crashes(
    interval_seconds: float = 60.0,
    watch_processes: list[str] | None = None,
    url: str = SYNAPSE_URL,
) -> None:
    """Monitor for app crashes on a timer."""
    watcher = AppCrashWatcher(watch_processes)
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
