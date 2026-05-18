---
name: os-macos
description: Parix OS Skill — macOS
---

# Parix OS Skill — macOS

> Platform: `darwin` | Minimum: macOS 13 Ventura | Recommended: macOS 14 Sonoma+

## Capabilities

### Shell & Process Control
- **Default shell**: zsh (`/bin/zsh`). Bash available at `/bin/bash`.
- **Process management**: `ps aux`, `kill`, `killall`, `pkill`.
- **Process info**: `top -l 1`, `vm_stat`, `sysctl hw.memsize`.
- **Launch apps**: `open -a "Safari"`, `open /path/to/file`.
- **Background jobs**: `nohup`, `disown`, `launchctl`.

### File System
- **Path separator**: Forward slash `/`.
- **Home**: `$HOME` (typically `/Users/<name>`).
- **App data**: `~/Library/Application Support/<app>`.
- **Preferences**: `~/Library/Preferences/` (plist files).
- **Temp**: `$TMPDIR` or `/tmp`.
- **Trash**: `trash` CLI or `osascript -e 'tell application "Finder" to delete POSIX file "/path"'`.
- **Spotlight search**: `mdfind "query"`, `mdfind -name "filename"`.
- **File watchers**: `fswatch` or `FSEvents` via Python.
- **Disk usage**: `df -h`, `du -sh`.

### System Monitoring
- **System profiler**: `system_profiler SPHardwareDataType`.
- **CPU usage**: `top -l 1 | head -n 10`, `sysctl -n hw.ncpu`.
- **Memory**: `vm_stat`, `sysctl hw.memsize`.
- **Disk**: `df -h`, `diskutil list`.
- **Battery**: `pmset -g batt`.
- **Network**: `networksetup -listallhardwareports`, `ifconfig`, `netstat`.
- **Wi-Fi**: `networksetup -getairportnetwork en0`.
- **Uptime**: `uptime`, `sysctl kern.boottime`.
- **Console logs**: `log show --predicate 'process == "appName"' --last 5m`.

### Task Scheduling
- **launchd**: Primary scheduler. Plist files in `~/Library/LaunchAgents/`.
- **Load/unload**: `launchctl load <plist>`, `launchctl bootout gui/$(id -u)/<label>`.
- **Cron**: Available but launchd preferred. `crontab -e`.
- **at**: `at` command for one-time scheduling.

### AppleScript / Shortcuts
- **Run AppleScript**: `osascript -e 'tell application "Finder" to ...'`.
- **Shortcuts**: `shortcuts run "Shortcut Name"` (macOS 12+).
- **UI scripting**: `tell application "System Events" to click button "OK" of window 1 of process "App"`.
- **Notifications**: `osascript -e 'display notification "msg" with title "Parix"'`.
- **Dialogs**: `osascript -e 'display dialog "msg"'` (requires user interaction).

### Accessibility (AXUIElement)
- **Backend**: `pyobjc` wrapping `AXUIElement` API.
- **Capabilities**: Window tree, element attributes (`AXRole`, `AXTitle`, `AXValue`, `AXDescription`), actions (`AXPress`, `AXConfirm`), observers for UI events.
- **Focused app**: `NSWorkspace.sharedWorkspace().frontmostApplication()`.
- **Focused element**: `AXUIElementCreateSystemWide()` → `AXFocusedUIElement`.
- **Dependencies**: `pip install pyobjc-core pyobjc-framework-Cocoa pyobjc-framework-ApplicationServices`.
- **Permission required**: System Settings > Privacy & Security > Accessibility.
- **Fallback**: Vision layer (mss + Tesseract OCR) if permission denied.

### Notifications
- **Native**: `osascript -e 'display notification "body" with title "title"'`.
- **node-notifier**: Uses `terminal-notifier` on macOS.
- **Notification Center**: All notifications appear here.
- **Do Not Disturb**: Check `defaults read com.apple.controlcenter "NSStatusItem Visible FocusModes"`.

### Package Management
- **Homebrew**: `brew install <pkg>`, `brew upgrade`, `brew list`.
- **pip**: `pip3 install <pkg>`.
- **npm**: Global tools via `npm install -g`.
- **mas**: Mac App Store CLI: `mas install <id>`, `mas upgrade`.
- **Detect**: `command -v brew`, `command -v mas`.

### Security & Permissions
- **Accessibility permission**: Required for UI automation — `tccutil` or System Settings.
- **Full Disk Access**: May be needed for monitoring certain directories.
- **Gatekeeper**: `spctl --assess --type execute /path/to/app`.
- **Keychain**: `security find-generic-password -s "service"`, `keytar` npm package.
- **Firewall**: `socketfilterfw` or System Settings.
- **SIP**: System Integrity Protection — cannot be disabled by Parix (nor should it be).

### macOS-Specific Features
- **iMessage bridge**: `osascript` to send messages (requires Messages.app access).
- **iCloud Drive**: `~/Library/Mobile Documents/com~apple~CloudDocs/`.
- **Clipboard**: `pbcopy`, `pbpaste`.
- **Screenshot**: `screencapture -x /tmp/screenshot.png`.
- **Dictation**: `say "text"` for text-to-speech.
- **Spaces/Desktops**: Accessible via `System Events` AppleScript.

### Environment Variables
- **Read**: `echo $VARNAME`, `printenv`.
- **Set session**: `export VARNAME="value"`.
- **Set persistent**: Add to `~/.zshrc` or `~/.zprofile`.
- **launchd env**: `launchctl setenv KEY VALUE`.

## Skill Routing

When `process.platform === 'darwin'` or `sys.platform == 'darwin'`:

| Task Type | Tool | Example |
|-----------|------|---------|
| Run command | zsh | `zsh -c "command"` |
| File operations | Node fs / bash | `cp`, `mv`, `rm` |
| System health | sysctl / vm_stat | `sysctl hw.memsize` |
| Console logs | `log` CLI | `log show --last 5m` |
| Install software | Homebrew | `brew install <pkg>` |
| Schedule task | launchd | Plist in `~/Library/LaunchAgents/` |
| UI inspection | pyobjc | AXUIElement API |
| Notifications | osascript | `display notification` |
| Automation | AppleScript/Shortcuts | `osascript`, `shortcuts run` |
| Clipboard | pbcopy/pbpaste | `echo "text" \| pbcopy` |
| Screenshot | screencapture | `screencapture -x /tmp/shot.png` |

## Limitations

- Accessibility requires explicit user permission grant in System Settings.
- SIP prevents modifying system files and certain process operations.
- Notarization: unsigned binaries trigger Gatekeeper warnings.
- `pywinauto` is Windows-only — do not import on macOS.
- Some `node-notifier` features (actions/buttons) limited on macOS.
- Apple Silicon (arm64) vs Intel (x86_64): check `uname -m` for architecture-specific binaries.
