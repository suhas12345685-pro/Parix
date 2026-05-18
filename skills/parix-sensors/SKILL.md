---
name: parix-sensors
description: Parix Skill — Sensors & Shadow Loop
---

# Parix Skill — Sensors & Shadow Loop

> Use when adding, modifying, or debugging sensor modules in the Python Hands layer.

## Sensor Architecture

Sensors live in `hands/sensors/` and run as background threads inside the Hands Python process. They emit `SENSOR_EVENT` messages over the Synapse bridge to Atrium.

```
Shadow Loop (60s interval) ──► Checks disk/CPU/memory/battery/uptime
                              ├── Delegates to WifiWatcher
                              ├── Delegates to UsbWatcher
                              └── Delegates to AppCrashWatcher

Terminal Error Watcher ──► Watches terminal stdout for error patterns
Clipboard Watcher ──► Monitors clipboard for sensitive data
Silent Intent Detectors ──► 6 behavioral heuristics (idle_after_error, etc.)
```

## Sensor Inventory

| Module | File | Events Emitted | Interval |
|--------|------|----------------|----------|
| Shadow Loop | `shadow_loop.py` | disk_low, cpu_high, memory_high, swap_high, battery_low, long_uptime, idle_shutdown | 60s |
| Wi-Fi | `wifi_watch.py` | wifi_disconnected, wifi_reconnected, wifi_weak_signal, wifi_ssid_changed | via shadow loop |
| USB | `usb_watch.py` | usb_device_connected, usb_device_disconnected, usb_storage_connected | via shadow loop |
| App Crash | `app_crash.py` | app_crash, app_hang | via shadow loop |
| Terminal | `terminal_error.py` | terminal_error | 2s polling |
| Clipboard | `clipboard_watch.py` | clipboard_sensitive_data | 3s polling |
| Silent Intent | `silent_intent.py` | silent:idle_after_error, silent:read_without_edit, etc. | event-driven |

## Adding a New Sensor

1. Create `hands/sensors/my_sensor.py`
2. Implement a `MyWatcher` class with:
   - `__init__(self)` — initialize state
   - `check(self) -> list[dict]` — return list of events (may be empty)
3. Each event dict must have: `event_type`, `data`, `confidence` (0.0–1.0)
4. Register in `shadow_loop.py` if periodic, or start as own thread if independent
5. Add event type handler in `atrium/src/intelligence/council.ts` `buildPlan()` method
6. Add test in `hands/tests/test_watcher.py`

## Event Schema

```python
{
    "event_type": "wifi_disconnected",
    "data": {
        "last_ssid": "HomeNetwork",
        "interface": "Wi-Fi",
        "timestamp": "2026-05-15T10:30:00Z"
    },
    "confidence": 0.95
}
```

## Platform-Specific Detection

| Sensor | Windows | macOS | Linux |
|--------|---------|-------|-------|
| Wi-Fi | `netsh wlan show interfaces` | `airport -I` | `iwconfig` / `nmcli` |
| USB | PowerShell `Get-PnpDevice` | `system_profiler SPUSBDataType` | `lsusb` |
| App Crash | Event Log IDs 1000,1002 | Console ReportCrash/spindump | `journalctl` segfault/OOM |
| Clipboard | `win32clipboard` | `pbpaste` | `xclip -o` |

## Shadow Loop Startup

```python
# In hands/main.py — called before WS server starts
from sensors.shadow_loop import start_shadow_thread
start_shadow_thread()
```

The shadow loop runs as a daemon thread and dies when Hands exits.

## Testing

```bash
# Unit tests for sensor pattern detection
pytest -q hands/tests/test_watcher.py

# Manual — trigger a fake sensor event
python -c "from sensors.shadow_loop import check_disk; print(check_disk())"
```
