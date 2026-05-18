# Probe Matrix

| Capability | Windows | macOS | Linux | Docker |
| --- | --- | --- | --- | --- |
| accessibility | `pywinauto` | `ApplicationServices` | `pyatspi` or `gi` | false |
| screenshot | `mss` | `mss` or `screencapture` | `mss`, `grim`, `scrot`, `gnome-screenshot` | false |
| clipboard | `pyperclip` or PowerShell | `pyperclip` or `pbpaste` | `pyperclip`, `wl-paste`, `xclip`, `xsel` | false |
| notifications | PowerShell/toast path | `osascript` | `notify-send` | webhook/chat only |
| package_manager | `winget`, `choco`, `scoop` | `brew`, `mas` | `apt`, `dnf`, `pacman`, `snap`, `flatpak` | container manager if installed |
