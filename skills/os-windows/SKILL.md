---
name: os-windows
description: Parix OS Skill — Windows
---

# Parix OS Skill — Windows

> Platform: `win32` | Minimum: Windows 10 21H2 | Recommended: Windows 11

## Capabilities

### Shell & Process Control
- **PowerShell**: Default shell. Use `powershell -Command "..."` or `pwsh` for PS7.
- **CMD**: Fallback via `cmd /c "..."` for legacy scripts.
- **Process management**: `Get-Process`, `Stop-Process`, `Start-Process`.
- **WMI/CIM queries**: `Get-CimInstance Win32_Process`, `Win32_Service`, `Win32_OperatingSystem`.
- **Task kill by pattern**: `Get-Process | Where-Object {$_.MainWindowTitle -match "pattern"} | Stop-Process`.

### File System
- **Path separator**: Backslash `\`. Use `[System.IO.Path]::Combine()` for safety.
- **Home directory**: `$env:USERPROFILE` (typically `C:\Users\<name>`).
- **App data**: `$env:LOCALAPPDATA`, `$env:APPDATA`.
- **Temp directory**: `$env:TEMP`.
- **Long paths**: Enabled via registry `HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem\LongPathsEnabled`.
- **File watchers**: `System.IO.FileSystemWatcher` for real-time monitoring.
- **Recycle Bin**: Items go to `$Recycle.Bin` — reversible delete.

### System Monitoring
- **Event Log**: `Get-WinEvent -LogName Application -MaxEvents 50`. Key logs: Application, System, Security.
- **Performance counters**: `Get-Counter '\Processor(_Total)\% Processor Time'`.
- **Disk space**: `Get-PSDrive -PSProvider FileSystem`.
- **Memory**: `Get-CimInstance Win32_OperatingSystem | Select FreePhysicalMemory`.
- **Network**: `Get-NetAdapter`, `Get-NetTCPConnection`, `Test-NetConnection`.
- **Services**: `Get-Service`, `Restart-Service`, `Start-Service`.
- **Uptime**: `(Get-CimInstance Win32_OperatingSystem).LastBootUpTime`.

### Task Scheduling
- **Task Scheduler**: `Register-ScheduledTask`, `Get-ScheduledTask`, `Unregister-ScheduledTask`.
- **One-time tasks**: `New-ScheduledTaskAction` + `New-ScheduledTaskTrigger -Once -At "3pm"`.
- **Recurring**: Triggers support Daily, Weekly, AtStartup, AtLogOn.

### Registry
- **Read**: `Get-ItemProperty -Path "HKCU:\Software\..."`.
- **Write**: `Set-ItemProperty -Path "HKCU:\Software\..." -Name "Key" -Value "Val"`.
- **Common paths**: `HKLM:\SOFTWARE`, `HKCU:\Software`, `HKCR:\`.
- **Startup programs**: `HKCU:\Software\Microsoft\Windows\CurrentVersion\Run`.

### Accessibility (UIAutomation)
- **Backend**: `pywinauto` wrapping COM UIAutomation API.
- **Capabilities**: Window enumeration, control tree traversal, property reading, pattern invocation (Invoke, Value, Selection, Toggle, ScrollItem).
- **Active window**: `pywinauto.application.Application().connect(active_only=True)`.
- **Focused element**: `auto.UIAutomationClient.IUIAutomation.GetFocusedElement()`.
- **Dependencies**: `pip install pywinauto` (conditional in requirements.txt via `sys_platform=='win32'`).
- **Fallback**: If UIAutomation fails, use vision layer (mss screenshot + Tesseract OCR).

### Notifications
- **Toast notifications**: `node-notifier` uses `SnoreToast.exe` on Windows.
- **System tray**: Not natively supported — use `electron` or `systray2` if needed.
- **Action Center**: Toasts appear in Action Center by default on Win10+.

### Package Management
- **winget**: `winget install <package>`, `winget upgrade --all`.
- **choco**: `choco install <package>` (if Chocolatey installed).
- **scoop**: `scoop install <package>` (if Scoop installed).
- **Detect which**: Check `command -v winget`, `command -v choco`, `command -v scoop`.

### Security & Permissions
- **Admin check**: `([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)`.
- **UAC**: Cannot bypass — prompt user if elevation needed.
- **Firewall**: `Get-NetFirewallRule`, `New-NetFirewallRule`.
- **Defender**: `Get-MpComputerStatus`, `Get-MpThreat`.

### Environment Variables
- **Read**: `$env:VARNAME`.
- **Set session**: `$env:VARNAME = "value"`.
- **Set persistent**: `[Environment]::SetEnvironmentVariable("NAME", "value", "User")`.
- **List all**: `Get-ChildItem Env:`.

## Skill Routing

When `process.platform === 'win32'` or `sys.platform == 'win32'`:

| Task Type | Tool | Example |
|-----------|------|---------|
| Run command | PowerShell | `powershell -Command "Get-Process"` |
| File operations | PowerShell / Node fs | `Copy-Item`, `Remove-Item` |
| System health | WMI/CIM | `Get-CimInstance Win32_OperatingSystem` |
| Event logs | PowerShell | `Get-WinEvent -LogName System -MaxEvents 20` |
| Install software | winget/choco | `winget install <id>` |
| Schedule task | Task Scheduler | `Register-ScheduledTask` |
| UI inspection | pywinauto | `UIAutomation` COM API |
| Notifications | node-notifier | SnoreToast backend |
| Network diagnostics | PowerShell | `Test-NetConnection`, `Get-NetAdapter` |
| Service management | PowerShell | `Get-Service`, `Restart-Service` |

## Limitations

- No native `cron` — use Task Scheduler instead.
- `asyncio.create_subprocess_shell` uses `cmd.exe` by default on Windows.
- Path length limit is 260 chars unless long paths enabled.
- Some Python packages (e.g., `pyobjc`, `pyatspi2`) are macOS/Linux-only — skip on Windows.
- `signal.SIGTERM` works but `SIGKILL` doesn't exist — use `taskkill /f`.
