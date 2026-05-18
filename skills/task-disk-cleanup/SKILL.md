---
name: task-disk-cleanup
description: Skill — Disk Cleanup
---

# Skill — Disk Cleanup

> Triggered when `disk_low` or `disk_space_low` events fire. Cleans temp files, caches, and logs without touching user data.

## Strategy

1. **Identify OS** from install context (`windows`, `macos`, `linux`).
2. **Safe targets** — only clean directories that are clearly temporary/cache:
   - Windows: `%TEMP%`, `%LOCALAPPDATA%\Temp`, npm/yarn/pip caches, Windows Update cleanup
   - macOS: `~/Library/Caches`, `/tmp`, Homebrew cache, npm/yarn/pip caches
   - Linux: `/tmp`, `~/.cache`, `/var/log` (old rotated logs), npm/yarn/pip caches
3. **Docker**: If Docker is installed, `docker system prune -f` is safe and often recovers gigabytes.
4. **Never touch**: user documents, desktop, downloads, git repos, databases, `.env` files.

## Commands by Platform

### Windows
```powershell
# Temp files
Get-ChildItem $env:TEMP -Recurse | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
# npm cache
npm cache clean --force
# Windows Update cleanup (requires admin)
# Dism.exe /online /Cleanup-Image /StartComponentCleanup
```

### macOS
```bash
# User caches older than 7 days
find ~/Library/Caches -maxdepth 2 -mtime +7 -exec rm -rf {} + 2>/dev/null
# System temp
find /tmp -maxdepth 1 -mtime +7 -exec rm -rf {} + 2>/dev/null
# Homebrew
brew cleanup --prune=7 2>/dev/null
# npm
npm cache clean --force
```

### Linux
```bash
# Temp files
find /tmp -maxdepth 1 -mtime +7 -exec rm -rf {} + 2>/dev/null
# User cache
find ~/.cache -maxdepth 2 -mtime +30 -exec rm -rf {} + 2>/dev/null
# Old logs (rotated)
find /var/log -name "*.gz" -mtime +30 -delete 2>/dev/null
# Package manager
apt-get autoremove -y 2>/dev/null || dnf autoremove -y 2>/dev/null
# npm
npm cache clean --force
```

## Reversibility

- Temp files: low risk, regenerated automatically
- Caches: medium risk, re-downloaded on next use (slower first run)
- Score: 0.5 (safe but not instantly reversible)

## Escalation

If free space is still below 5% after cleanup, notify the user with a list of large directories (`du -sh /* | sort -rh | head -10`). Never auto-delete user files.
