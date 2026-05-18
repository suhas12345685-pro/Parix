---
name: os-detect
description: Parix OS Skill — Platform Detection & Routing
---

# Parix OS Skill — Platform Detection & Routing

> This skill is loaded first to determine which OS-specific skill to activate.

## Detection Logic

### Node.js (Atrium)
```javascript
const os = require('os');
const platform = process.platform;  // 'win32' | 'darwin' | 'linux'
const arch = process.arch;          // 'x64' | 'arm64'
const release = os.release();       // e.g., '10.0.19045' (Win), '23.5.0' (macOS)
const isDocker = fs.existsSync('/.dockerenv') || fs.existsSync('/run/.containerenv');
```

### Python (Hands)
```python
import sys, platform, os
plat = sys.platform          # 'win32' | 'darwin' | 'linux'
arch = platform.machine()    # 'AMD64' | 'arm64' | 'x86_64'
release = platform.release()
is_docker = os.path.exists('/.dockerenv') or os.path.exists('/run/.containerenv')
```

## Routing Table

```
if is_docker:
    load skills/os-docker.md
elif platform == 'win32':
    load skills/os-windows.md
elif platform == 'darwin':
    load skills/os-macos.md
elif platform == 'linux':
    load skills/os-linux.md
    # Sub-detect distro
    if distro_id in ('ubuntu', 'debian'):
        package_manager = 'apt'
    elif distro_id == 'fedora':
        package_manager = 'dnf'
    elif distro_id == 'arch':
        package_manager = 'pacman'
```

## Cross-Platform Abstractions

These operations exist on every platform but with different implementations:

| Operation | Windows | macOS | Linux | Docker |
|-----------|---------|-------|-------|--------|
| Run shell command | `powershell -Command` | `zsh -c` | `bash -c` | `bash -c` (in container) |
| Home directory | `$env:USERPROFILE` | `$HOME` | `$HOME` | `/app` |
| Temp directory | `$env:TEMP` | `$TMPDIR` | `/tmp` | `/tmp` |
| Path separator | `\` | `/` | `/` | `/` |
| Process list | `Get-Process` | `ps aux` | `ps aux` | `ps aux` |
| Kill process | `Stop-Process -Id` | `kill <pid>` | `kill <pid>` | `kill <pid>` |
| Disk space | `Get-PSDrive` | `df -h` | `df -h` | `df -h` |
| Memory info | `Get-CimInstance` | `vm_stat` | `free -h` | `free -h` |
| Clipboard read | `Get-Clipboard` | `pbpaste` | `xclip -o` | N/A |
| Clipboard write | `Set-Clipboard` | `pbcopy` | `xclip -i` | N/A |
| Screenshot | `Add-Type` + BitBlt | `screencapture` | `scrot`/`grim` | N/A |
| Notifications | SnoreToast | `osascript` | `notify-send` | API only |
| Service manager | Task Scheduler | launchd | systemd | Docker |
| Package manager | winget/choco | brew | apt/dnf/pacman | apt (Debian base) |
| Accessibility | UIAutomation | AXUIElement | AT-SPI2 | N/A |
| File watcher | FileSystemWatcher | FSEvents | inotify | inotify |

## Startup Sequence

1. Detect platform and architecture
2. Check if running in Docker container
3. Load appropriate OS skill file
4. Verify required dependencies for that OS
5. Log detected configuration to SQLite `events` table
6. Fall back gracefully if a capability is missing

## Capability Probing

Before using an OS-specific feature, probe for it:

```python
def probe_capability(name: str) -> bool:
    probes = {
        'accessibility': _probe_accessibility,
        'screenshot': _probe_screenshot,
        'clipboard': _probe_clipboard,
        'notifications': _probe_notifications,
        'package_manager': _probe_package_manager,
    }
    return probes.get(name, lambda: False)()
```

If a probe fails, Parix sends a `CAPABILITY_MISSING` message to Atrium, which can:
- Use an alternative approach
- Notify the user what to install
- Degrade gracefully (e.g., skip UI automation, use API-only notifications)
