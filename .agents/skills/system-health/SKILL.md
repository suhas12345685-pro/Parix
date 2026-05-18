---
name: system-health
description: Proactive system health monitoring — disk, CPU, memory, battery, swap, uptime. Runs as a background shadow loop.
---

# System Health — Shadow Loop Monitor

> Use when the agent needs to monitor the machine's health and surface proactive warnings before the user notices problems.

## What It Monitors

| Metric | Threshold | Event |
|---|---|---|
| Disk free space | < 10 % | `disk_low` |
| CPU usage | ≥ 90 % | `cpu_high` |
| RAM usage | ≥ 90 % | `memory_high` |
| Swap usage | ≥ 80 % | `swap_high` |
| Battery (unplugged) | ≤ 15 % | `battery_low` |
| Idle + low battery | > 30 min idle, < 20 % | `idle_shutdown` (intent) |
| System uptime | ≥ 72 hours | `long_uptime` (intent) |

## Usage

```python
# One-shot sweep (returns list of events)
from hands.sensors.shadow_loop import sweep
events = sweep()

# Background thread (fire-and-forget)
from hands.sensors.shadow_loop import start_shadow_thread
start_shadow_thread(interval=60.0)

# Async loop (connects to Synapse WebSocket)
from hands.sensors.shadow_loop import run_shadow_loop
await run_shadow_loop(interval_seconds=60.0, url="ws://localhost:8765")
```

## Event Format

```json
{
  "type": "SENSOR_EVENT",
  "event_type": "disk_low",
  "data": {
    "drives": [{"mount": "C:\\", "free_pct": 4.2, "free_gb": 8.5, "total_gb": 200.0}],
    "os": "win32"
  },
  "confidence": 0.95,
  "timestamp": 1716000000.0
}
```

## Dependencies

- `psutil` — primary metric source (graceful fallback if missing)
- `shutil.disk_usage` — disk fallback when psutil unavailable
- `ctypes` (Windows) — idle time via GetLastInputInfo

## Key Files

- `hands/sensors/shadow_loop.py` — Core sweep + async/thread runners
- `hands/sensors/wifi_watch.py` — Delegated Wi-Fi checks
- `hands/sensors/usb_watch.py` — Delegated USB checks
- `hands/sensors/app_crash.py` — Delegated crash detection
