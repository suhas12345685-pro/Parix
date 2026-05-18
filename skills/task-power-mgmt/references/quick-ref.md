# Power Management Quick Reference

## Battery Check Commands

| Platform | Command |
|---|---|
| Windows | `powershell -c "(Get-WmiObject Win32_Battery).EstimatedChargeRemaining"` |
| macOS | `pmset -g batt` |
| Linux | `cat /sys/class/power_supply/BAT0/capacity` |

## Uptime Commands

| Platform | Command |
|---|---|
| Windows | `powershell -c "(Get-Date) - (gcim Win32_OperatingSystem).LastBootUpTime"` |
| macOS | `uptime` |
| Linux | `cat /proc/uptime` or `uptime` |

## Thresholds

| Level | Battery % | Uptime | Urgency |
|---|---|---|---|
| Info | ≤20% | — | low |
| Warning | ≤15% | — | medium |
| Critical | ≤10% | — | high |
| Emergency | ≤5% | — | critical |
| Idle+Low | ≤20% + idle>30min | — | high |
| Long uptime | — | ≥72h | low |

## Parix Rules
- Never auto-save or auto-shutdown — notify only
- Never access power settings — read-only monitoring
- Emergency: suggest "save all work now"
