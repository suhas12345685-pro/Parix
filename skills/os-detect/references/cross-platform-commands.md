# Cross-Platform Command Reference

Quick lookup for platform-equivalent commands used by Parix routing.

## Shell Execution

| Action         | Windows                    | macOS            | Linux            | Docker           |
|----------------|----------------------------|------------------|------------------|------------------|
| Default shell  | `powershell -Command`      | `zsh -c`         | `bash -c`        | `bash -c`        |
| Run script     | `powershell -File x.ps1`  | `bash x.sh`      | `bash x.sh`      | `bash x.sh`      |
| Env var read   | `$env:VAR`                 | `$VAR`           | `$VAR`           | `$VAR`           |
| Env var set    | `$env:VAR = "val"`         | `export VAR=val` | `export VAR=val` | `export VAR=val` |

## File System

| Action         | Windows               | macOS / Linux         | Docker                |
|----------------|-----------------------|-----------------------|-----------------------|
| Home dir       | `$env:USERPROFILE`    | `$HOME`               | `/app`                |
| Temp dir       | `$env:TEMP`           | `$TMPDIR` or `/tmp`   | `/tmp`                |
| Path separator | `\`                   | `/`                   | `/`                   |
| List files     | `Get-ChildItem`       | `ls -la`              | `ls -la`              |
| Copy           | `Copy-Item`           | `cp`                  | `cp`                  |
| Delete         | `Remove-Item`         | `rm`                  | `rm`                  |

## System Info

| Action         | Windows                          | macOS                  | Linux               |
|----------------|----------------------------------|------------------------|----------------------|
| CPU count      | `$env:NUMBER_OF_PROCESSORS`      | `sysctl -n hw.ncpu`   | `nproc`              |
| Memory         | `Get-CimInstance Win32_OS`       | `sysctl hw.memsize`   | `free -h`            |
| Disk           | `Get-PSDrive`                    | `df -h`               | `df -h`              |
| Uptime         | `Get-CimInstance Win32_OS`       | `uptime`              | `uptime`             |
| OS version     | `[Environment]::OSVersion`       | `sw_vers`             | `cat /etc/os-release`|

## Process Management

| Action         | Windows                  | macOS / Linux      |
|----------------|--------------------------|--------------------|
| List           | `Get-Process`            | `ps aux`           |
| Kill by PID    | `Stop-Process -Id N`    | `kill N`           |
| Kill by name   | `Stop-Process -Name x`  | `killall x`        |

## Capability Probes

| Capability      | Windows Probe              | macOS Probe             | Linux Probe                  |
|-----------------|---------------------------|-------------------------|------------------------------|
| Clipboard       | always available          | `which pbcopy`          | `which xclip` or `wl-copy`  |
| Screenshot      | PowerShell BitBlt         | `which screencapture`   | `which scrot` or `grim`     |
| Notifications   | SnoreToast bundled        | `which osascript`       | `which notify-send`         |
| Package mgr     | `where.exe winget`       | `which brew`            | `which apt/dnf/pacman`      |
| Accessibility   | pywinauto importable     | AXUIElement permission  | AT-SPI2 D-Bus reachable     |
