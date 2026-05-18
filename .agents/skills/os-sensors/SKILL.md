---
name: os-sensors
description: Monitor the OS in the background — terminal errors, Wi-Fi, USB, app crashes, clipboard, window activity.
---

# OS Sensors

> Use when the agent needs to watch the OS for events — errors in the terminal, Wi-Fi drops, USB plugs, app crashes, sensitive clipboard data.

## Sensor Inventory

| Sensor | Module | Poll Interval | Events Emitted |
|---|---|---|---|
| Terminal Watcher | `sensors/watcher.py` | 2s | `terminal_error` |
| Terminal Error | `sensors/terminal_error.py` | on-demand | `terminal_error` |
| Wi-Fi Monitor | `sensors/wifi_watch.py` | 30s | `wifi_disconnected`, `wifi_reconnected`, `wifi_weak_signal`, `wifi_ssid_changed` |
| USB Monitor | `sensors/usb_watch.py` | 10s | `usb_device_connected`, `usb_device_disconnected`, `usb_storage_connected` |
| App Crash | `sensors/app_crash.py` | 60s | `app_crash`, `app_hang`, `service_down` |
| Clipboard | `sensors/clipboard_watch.py` | 5s | `clipboard_sensitive_data` |
| Silent Intent | `sensors/silent_intent.py` | 60s | `idle_shutdown`, `tab_overload` |
| Shadow Loop | `sensors/shadow_loop.py` | 60s | `disk_low`, `cpu_high`, `memory_high`, `battery_low` |

## Event Format (SENSOR_EVENT)

```json
{
  "type": "SENSOR_EVENT",
  "event_type": "terminal_error",
  "data": {"output": "...", "matches": ["traceback", "error:"]},
  "confidence": 0.75,
  "timestamp": 1716000000.0
}
```

## Watcher (unified poll loop)

The main watcher (`sensors/watcher.py`) is the Phase 3 centerpiece:
- Polls active window title every 2 seconds
- Tails last 20 lines of terminal buffer
- Scores output against 12 error patterns with severity weights
- Suppresses false positives ("0 errors", "ErrorBoundary", imports)
- Deduplicates by buffer hash (same output → no repeat event)

## Starting Sensors

Sensors start automatically in `hands/main.py`:
- Shadow loop: started as a background thread
- Watcher: started as an async task
- Other sensors: started on demand or via scheduler

## Key Files

- `hands/sensors/watcher.py` — Unified poll loop
- `hands/sensors/terminal_error.py` — Error pattern detection
- `hands/sensors/wifi_watch.py` — Network monitoring
- `hands/sensors/usb_watch.py` — USB device detection
- `hands/sensors/app_crash.py` — Crash log reader
- `hands/sensors/clipboard_watch.py` — Clipboard security
- `hands/sensors/silent_intent.py` — Behavioral inference
- `hands/sensors/shadow_loop.py` — System health
