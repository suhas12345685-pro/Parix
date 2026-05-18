---
name: platform-detect
description: Detect OS, architecture, and available capabilities (accessibility, screenshot, clipboard, notifications, package manager).
---

# Platform Detect — OS & Capability Probing

> Use when the agent needs to know what OS it's running on, what architecture, and which capabilities are available before choosing a strategy.

## Quick API

```python
from hands.platform import detect_os, detect_arch, detect_distro, probe_capability

os_name = detect_os()          # "windows" | "macos" | "linux" | "docker"
arch    = detect_arch()        # "x64" | "arm64"
distro  = detect_distro()      # "ubuntu" | "fedora" | None (non-Linux)

has_a11y = probe_capability("accessibility")
has_clip = probe_capability("clipboard")
```

## Capability Probes

| Capability | Windows | macOS | Linux |
|---|---|---|---|
| `accessibility` | pywinauto installed | ApplicationServices | pyatspi / gi |
| `screenshot` | mss or built-in | mss or screencapture | mss / grim / scrot |
| `clipboard` | pyperclip or PowerShell | pyperclip or pbpaste | xclip / xsel / wl-paste |
| `notifications` | PowerShell | osascript | notify-send |
| `package_manager` | winget / choco / scoop | brew / mas | apt / dnf / pacman |

## Docker Detection

`detect_os()` returns `"docker"` when `/.dockerenv` or `/run/.containerenv` exists. This is checked before the platform check so agents can skip hardware-dependent features inside containers.

## Key Files

- `hands/platform.py` — All detection logic
