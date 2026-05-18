# System Health Thresholds

| Metric | Threshold | Confidence | Rationale |
|---|---|---|---|
| Disk free | < 10% | 0.95 | Near-full disks cause crashes, build failures |
| CPU usage | ≥ 90% | 0.70 | Short spikes are normal; sustained = problem |
| RAM usage | ≥ 90% | 0.85 | OOM killer imminent on Linux |
| Swap usage | ≥ 80% | 0.75 | Heavy swapping = severe slowdown |
| Battery (unplugged) | ≤ 15% | 0.90 | Risk of sudden shutdown |
| Idle + low battery | 30 min + < 20% | 0.80 | User likely away, machine will die |
| Uptime | ≥ 72 hours | 0.60 | Stale state, kernel patches pending |

## Fallback Behavior

- If `psutil` is not installed, disk checks use `shutil.disk_usage` (limited to known mount paths)
- CPU and memory checks are skipped without psutil (return None)
- Idle time uses platform-specific APIs: Win32 GetLastInputInfo, macOS ioreg, Linux xprintidle
