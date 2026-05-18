# macOS Command Reference for Parix

## Process Management

| Command | Description |
|---------|-------------|
| `ps aux` | List all processes |
| `kill <pid>` | Send SIGTERM |
| `kill -9 <pid>` | Force kill |
| `killall Safari` | Kill by name |
| `pkill -f "pattern"` | Kill by pattern |
| `open -a "App Name"` | Launch application |
| `open /path/to/file` | Open file with default app |

## System Info

| Command | Description |
|---------|-------------|
| `sw_vers` | macOS version |
| `uname -m` | Architecture (arm64/x86_64) |
| `sysctl -n hw.ncpu` | CPU core count |
| `sysctl hw.memsize` | Total RAM |
| `vm_stat` | Memory statistics |
| `df -h` | Disk usage |
| `diskutil list` | All disks/partitions |
| `pmset -g batt` | Battery status |
| `system_profiler SPHardwareDataType` | Full hardware info |

## Network

| Command | Description |
|---------|-------------|
| `ifconfig` | Network interfaces |
| `networksetup -listallhardwareports` | All ports |
| `networksetup -getairportnetwork en0` | Wi-Fi SSID |
| `netstat -an \| grep LISTEN` | Listening ports |
| `lsof -i :8080` | What's on port 8080 |
| `ping -c 4 host` | Ping |
| `traceroute host` | Trace route |

## File System

| Command | Description |
|---------|-------------|
| `mdfind "query"` | Spotlight search |
| `mdfind -name "file.txt"` | Search by filename |
| `defaults read domain` | Read plist preferences |
| `defaults write domain key -type value` | Write preference |
| `ditto src dest` | Smart copy (preserves metadata) |
| `xattr -l file` | List extended attributes |

## AppleScript / Automation

| Command | Description |
|---------|-------------|
| `osascript -e 'tell app "Finder" to ...'` | Run AppleScript |
| `osascript -e 'display notification "msg"'` | Show notification |
| `osascript -e 'display dialog "msg"'` | Show dialog |
| `shortcuts run "Name"` | Run Shortcut |
| `automator workflow.workflow` | Run Automator |

## Clipboard

| Command | Description |
|---------|-------------|
| `pbcopy < file.txt` | Copy to clipboard |
| `pbpaste` | Paste from clipboard |
| `pbpaste > file.txt` | Save clipboard to file |

## Screenshot

| Command | Description |
|---------|-------------|
| `screencapture -x file.png` | Silent full screenshot |
| `screencapture -R x,y,w,h file.png` | Capture region |
| `screencapture -l <windowID> file.png` | Capture window |

## Service Management (launchd)

| Command | Description |
|---------|-------------|
| `launchctl list` | List loaded services |
| `launchctl load ~/Library/LaunchAgents/x.plist` | Load agent |
| `launchctl bootout gui/$(id -u)/label` | Unload agent |
| `launchctl kickstart gui/$(id -u)/label` | Force start |

## Security

| Command | Description |
|---------|-------------|
| `security find-generic-password -s svc` | Keychain lookup |
| `spctl --assess /path/to/app` | Gatekeeper check |
| `csrutil status` | SIP status |
| `sudo lsof -i -P` | All network connections |
