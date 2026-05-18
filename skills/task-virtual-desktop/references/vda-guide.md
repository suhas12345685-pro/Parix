# Virtual Desktop Automation Reference

## Windows Virtual Desktops

| Action | Method |
|---|---|
| Create desktop | `pyvda.VirtualDesktop.create()` |
| List desktops | `pyvda.get_virtual_desktops()` |
| Switch to desktop | `desktop.go()` |
| Move window | `pyvda.AppView(hwnd).move(desktop)` |
| Remove desktop | `desktop.remove()` |

## Requirements
- Windows 10/11 only
- `pip install pyvda`
- No admin privileges needed

## Rules
- Always work on a secondary desktop, never the user's primary
- Close the workspace desktop when the task completes
- If pyvda is unavailable, fall back to headless mode
- Log all desktop operations for audit
