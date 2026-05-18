# Disk Cleanup Quick Reference

## Safe Targets by OS

| OS | Temp Dir | Cache Dir | Log Dir |
|---|---|---|---|
| Windows | `%TEMP%` | `%LOCALAPPDATA%\Temp` | Event Viewer |
| macOS | `/tmp` | `~/Library/Caches` | `/var/log` |
| Linux | `/tmp` | `~/.cache` | `/var/log` |

## Package Manager Caches

| Tool | Clean Command |
|---|---|
| npm | `npm cache clean --force` |
| yarn | `yarn cache clean` |
| pip | `pip cache purge` |
| pnpm | `pnpm store prune` |
| brew | `brew cleanup --prune=7` |
| Docker | `docker system prune -f` |

## Thresholds

| Disk Free | Urgency | Action |
|---|---|---|
| > 15% | None | No action |
| 10-15% | Low | Notification only |
| 5-10% | Medium | Auto-clean temp/cache |
| < 5% | High | Clean + escalate to user |

## Never Delete

- User documents, Desktop, Downloads
- Git repositories (`.git/`)
- Environment files (`.env`)
- Databases (`.sqlite`, `.db`, data dirs)
- SSH keys (`~/.ssh/`)
