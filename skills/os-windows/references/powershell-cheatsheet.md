# Windows PowerShell Cheatsheet for Parix

## Process Management

| Command | Description |
|---------|-------------|
| `Get-Process` | List all processes |
| `Get-Process -Name chrome` | Filter by name |
| `Stop-Process -Id 1234` | Kill by PID |
| `Stop-Process -Name notepad` | Kill by name |
| `Start-Process notepad` | Launch process |
| `Get-Process \| Sort CPU -Desc \| Select -First 10` | Top CPU consumers |

## File System

| Command | Description |
|---------|-------------|
| `Get-ChildItem -Recurse -Filter *.log` | Find files |
| `Copy-Item src dest` | Copy |
| `Move-Item src dest` | Move |
| `Remove-Item path -Recurse` | Delete |
| `Test-Path path` | Check existence |
| `Get-Content file.txt -Tail 20` | Tail a file |
| `Set-Content file.txt "data"` | Write file |

## System Info

| Command | Description |
|---------|-------------|
| `Get-CimInstance Win32_OperatingSystem` | OS details |
| `Get-CimInstance Win32_Processor` | CPU info |
| `Get-PSDrive -PSProvider FileSystem` | Disk usage |
| `Get-Counter '\Processor(_Total)\% Processor Time'` | CPU usage |
| `Get-NetAdapter` | Network adapters |
| `Get-NetTCPConnection -State Listen` | Listening ports |
| `Test-NetConnection host -Port 443` | Port check |

## Services

| Command | Description |
|---------|-------------|
| `Get-Service` | List all services |
| `Get-Service -Name wuauserv` | Specific service |
| `Restart-Service -Name wuauserv` | Restart |
| `Start-Service / Stop-Service` | Start or stop |

## Registry

| Command | Description |
|---------|-------------|
| `Get-ItemProperty HKCU:\Software\...` | Read key |
| `Set-ItemProperty HKCU:\Software\... -Name K -Value V` | Write key |
| `Test-Path HKLM:\SOFTWARE\...` | Check key exists |

## Event Logs

| Command | Description |
|---------|-------------|
| `Get-WinEvent -LogName Application -MaxEvents 20` | Recent app events |
| `Get-WinEvent -LogName System -MaxEvents 20` | Recent system events |
| `Get-WinEvent -FilterHashtable @{LogName='Application';Level=2}` | Errors only |

## Task Scheduler

| Command | Description |
|---------|-------------|
| `Get-ScheduledTask` | List tasks |
| `Register-ScheduledTask -TaskName "X" -Action $a -Trigger $t` | Create task |
| `Unregister-ScheduledTask -TaskName "X" -Confirm:$false` | Delete task |

## Environment Variables

| Command | Description |
|---------|-------------|
| `$env:VARNAME` | Read |
| `$env:VARNAME = "value"` | Set (session) |
| `[Environment]::SetEnvironmentVariable("K","V","User")` | Set (persistent) |
| `Get-ChildItem Env:` | List all |
