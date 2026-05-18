---
name: task-power-mgmt
description: Skill — Power & Battery Management
---

# Skill — Power & Battery Management

> Triggered on `battery_low`, `silent:idle_shutdown`, `silent:long_uptime` events.

## Battery Thresholds

| Level | Threshold | Action |
|---|---|---|
| Info | 20% | Low-priority notification |
| Warning | 15% | Medium notification |
| Critical | 10% | High-urgency notification |
| Emergency | 5% | Emergency notification + suggest save all |

## Idle + Low Battery

When both conditions are met:
1. **Notify immediately** with high urgency
2. **Suggest saving work** — the system may shut down unexpectedly
3. Never auto-save or auto-shutdown — that's the OS's responsibility

## Long Uptime

After 72+ hours of continuous uptime:
1. Low-priority notification suggesting a reboot
2. Mention: "Rebooting can free leaked memory and apply pending updates"
3. Repeat at 168 hours (1 week) with medium urgency

## Power Plan (Windows Only)

When on battery and CPU is high:
```powershell
# Check current power plan
powercfg /getactivescheme
# Switch to power saver (notification only — user decides)
# powercfg /setactive SCHEME_MAX
```

## Safety

- Never initiate shutdown, restart, sleep, or hibernate
- Never change power plans without user confirmation
- Never modify screen brightness or timeout settings
- Reversibility: 1.0 (all actions are notifications)
