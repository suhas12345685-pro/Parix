"""USB device sensor.

Monitors USB device connect/disconnect events.
Useful for detecting external drives, peripherals, or unknown devices.

Emits SENSOR_EVENT:
  - usb_device_connected: new USB device plugged in
  - usb_device_disconnected: USB device removed
  - usb_storage_connected: storage device specifically (external drive)
"""

from __future__ import annotations

import asyncio
import json
import subprocess
import sys
import time
from typing import Any

try:
    from hands._win_flags import CREATION_FLAGS
except ImportError:
    try:
        from _win_flags import CREATION_FLAGS
    except ImportError:
        CREATION_FLAGS = 0

import websockets

try:
    from hands.protocol import SensorEvent
except ImportError:
    from protocol import SensorEvent

SYNAPSE_URL = "ws://localhost:8765"


# ── Platform-specific device enumeration ─────────────────────────────

def list_usb_devices() -> list[dict[str, str]]:
    """Return a list of currently connected USB devices."""
    if sys.platform == "win32":
        return _list_windows()
    elif sys.platform == "darwin":
        return _list_macos()
    else:
        return _list_linux()


def _list_windows() -> list[dict[str, str]]:
    devices: list[dict[str, str]] = []
    try:
        out = _run([
            "powershell", "-NoProfile", "-Command",
            "Get-PnpDevice -Class USB -Status OK | Select-Object InstanceId, FriendlyName | ConvertTo-Csv -NoTypeInformation"
        ])
        for line in out.strip().splitlines()[1:]:  # skip header
            parts = line.strip('"').split('","')
            if len(parts) >= 2:
                devices.append({
                    "id": parts[0],
                    "name": parts[1] if len(parts) > 1 else "Unknown",
                    "type": "storage" if "mass storage" in parts[1].lower() or "disk" in parts[1].lower() else "peripheral",
                })
    except Exception:
        pass
    return devices


def _list_macos() -> list[dict[str, str]]:
    devices: list[dict[str, str]] = []
    try:
        out = _run(["system_profiler", "SPUSBDataType", "-detailLevel", "mini"])
        current_name = ""
        for line in out.splitlines():
            stripped = line.strip()
            if stripped.endswith(":") and not stripped.startswith("USB"):
                current_name = stripped.rstrip(":")
            elif "Serial Number:" in stripped:
                serial = stripped.split(":", 1)[1].strip()
                devices.append({
                    "id": serial,
                    "name": current_name or "Unknown",
                    "type": "peripheral",
                })
    except Exception:
        pass
    return devices


def _list_linux() -> list[dict[str, str]]:
    devices: list[dict[str, str]] = []
    try:
        out = _run(["lsusb"])
        for line in out.splitlines():
            # Bus 001 Device 003: ID 8087:0026 Intel Corp.
            parts = line.split("ID ", 1)
            if len(parts) == 2:
                id_and_name = parts[1]
                device_id = id_and_name.split(" ", 1)[0]
                name = id_and_name.split(" ", 1)[1] if " " in id_and_name else "Unknown"
                dtype = "storage" if any(k in name.lower() for k in ["storage", "disk", "flash"]) else "peripheral"
                devices.append({"id": device_id, "name": name.strip(), "type": dtype})
    except Exception:
        pass
    return devices


def _run(cmd: list[str]) -> str:
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10,
                                creationflags=CREATION_FLAGS)
        return result.stdout
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return ""


# ── Event detection ──────────────────────────────────────────────────

class UsbWatcher:
    """Stateful watcher that detects USB connect/disconnect."""

    def __init__(self) -> None:
        self.known_ids: set[str] = set()
        self.initialized = False

    def check(self) -> list[SensorEvent]:
        events: list[SensorEvent] = []
        current = list_usb_devices()
        current_ids = {d["id"] for d in current}
        current_map = {d["id"]: d for d in current}
        now = time.time()

        if not self.initialized:
            self.known_ids = current_ids
            self.initialized = True
            return events

        # New devices
        added = current_ids - self.known_ids
        for dev_id in added:
            dev = current_map.get(dev_id, {})
            event_type = "usb_storage_connected" if dev.get("type") == "storage" else "usb_device_connected"
            events.append(SensorEvent(
                event_type=event_type,
                data={"device_id": dev_id, "name": dev.get("name", "Unknown"), "type": dev.get("type", "unknown")},
                confidence=0.95,
                timestamp=now,
            ))

        # Removed devices
        removed = self.known_ids - current_ids
        for dev_id in removed:
            events.append(SensorEvent(
                event_type="usb_device_disconnected",
                data={"device_id": dev_id},
                confidence=0.9,
                timestamp=now,
            ))

        self.known_ids = current_ids
        return events


def to_message(event: SensorEvent) -> dict[str, Any]:
    return {
        "type": "SENSOR_EVENT",
        "event_type": event.event_type,
        "data": event.data,
        "confidence": event.confidence,
        "timestamp": event.timestamp,
    }


async def watch_usb(interval_seconds: float = 10.0, url: str = SYNAPSE_URL) -> None:
    """Monitor USB devices on a timer."""
    watcher = UsbWatcher()
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
