# Sensor Inventory — Quick Reference

## Sensor Modules

| Module | File | Events | Interval | Type |
|--------|------|--------|----------|------|
| Shadow Loop | `shadow_loop.py` | disk_low, cpu_high, memory_high, swap_high, battery_low, long_uptime, idle_shutdown | 60s | Periodic |
| Wi-Fi | `wifi_watch.py` | wifi_disconnected, wifi_reconnected, wifi_weak_signal, wifi_ssid_changed | Via shadow loop | Delegated |
| USB | `usb_watch.py` | usb_device_connected, usb_device_disconnected, usb_storage_connected | Via shadow loop | Delegated |
| App Crash | `app_crash.py` | app_crash, app_hang | Via shadow loop | Delegated |
| Terminal | `terminal_error.py` | terminal_error | 2s polling | Independent |
| Clipboard | `clipboard_watch.py` | clipboard_sensitive_data | 3s polling | Independent |
| Silent Intent | `silent_intent.py` | silent:idle_after_error, silent:read_without_edit, etc. | Event-driven | Reactive |

## Platform Detection Commands

| Sensor | Windows | macOS | Linux |
|--------|---------|-------|-------|
| Wi-Fi | `netsh wlan show interfaces` | `airport -I` | `iwconfig` / `nmcli` |
| USB | `Get-PnpDevice` (PowerShell) | `system_profiler SPUSBDataType` | `lsusb` |
| App Crash | Event Log IDs 1000, 1002 | Console ReportCrash/spindump | `journalctl` segfault/OOM |
| Clipboard | `win32clipboard` | `pbpaste` | `xclip -o` |

## Event Confidence Ranges

| Level | Range | Meaning |
|-------|-------|---------|
| High | 0.9 - 1.0 | Direct OS API confirmation |
| Medium | 0.6 - 0.9 | Heuristic or pattern match |
| Low | 0.3 - 0.6 | Inference or weak signal |
| Noise | < 0.3 | Should be filtered out |

## Adding a New Sensor

1. Create `hands/sensors/my_sensor.py`
2. Implement `MyWatcher` with `__init__()` and `check() -> list[dict]`
3. Each event: `{ event_type, data, confidence }`
4. Register in `shadow_loop.py` (periodic) or start as own thread
5. Add handler in `council.ts` `buildPlan()` method
6. Add test in `hands/tests/test_watcher.py`
