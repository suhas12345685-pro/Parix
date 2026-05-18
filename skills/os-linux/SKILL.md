---
name: os-linux
description: Parix OS Skill — Linux (Ubuntu/Debian/Fedora/Arch)
---

# Parix OS Skill — Linux (Ubuntu/Debian/Fedora/Arch)

> Platform: `linux` | Primary target: Ubuntu 22.04+ | Also: Debian 12+, Fedora 39+, Arch

## Capabilities

### Shell & Process Control
- **Default shell**: bash. Check `echo $SHELL`.
- **Process management**: `ps aux`, `kill`, `killall`, `pkill`, `htop`.
- **Process tree**: `pstree`, `ps -ef --forest`.
- **Background**: `nohup`, `disown`, `systemctl --user`.
- **Signal handling**: Full POSIX signals — `SIGTERM`, `SIGKILL`, `SIGHUP`, `SIGUSR1`.

### File System
- **Path separator**: Forward slash `/`.
- **Home**: `$HOME` (typically `/home/<name>`).
- **Config**: `$XDG_CONFIG_HOME` (default `~/.config/`).
- **Data**: `$XDG_DATA_HOME` (default `~/.local/share/`).
- **Temp**: `/tmp` or `$TMPDIR`.
- **File watchers**: `inotifywait` (inotify-tools), `pyinotify`.
- **File search**: `find`, `locate` (mlocate/plocate), `fd`.
- **Disk**: `df -h`, `du -sh`, `lsblk`.

### System Monitoring
- **CPU**: `nproc`, `lscpu`, `/proc/cpuinfo`, `mpstat`.
- **Memory**: `free -h`, `/proc/meminfo`, `vmstat`.
- **Disk I/O**: `iostat`, `iotop`.
- **Network**: `ip addr`, `ss -tlnp`, `nmcli`, `ping`.
- **Load average**: `uptime`, `/proc/loadavg`.
- **Temperature**: `sensors` (lm-sensors), `/sys/class/thermal/`.
- **GPU**: `nvidia-smi` (NVIDIA), `radeontop` (AMD).
- **Uptime**: `uptime`, `cat /proc/uptime`.
- **Kernel**: `uname -r`, `dmesg --level=err`.

### System Logs
- **journalctl**: `journalctl --user -u parix-agent --since "5 min ago"`.
- **Syslog**: `/var/log/syslog` (Debian/Ubuntu), `/var/log/messages` (Fedora).
- **Auth log**: `/var/log/auth.log`.
- **Kernel log**: `dmesg`, `journalctl -k`.
- **Application**: `journalctl -t <tag>`.

### Task Scheduling
- **systemd timers**: Preferred over cron for modern Linux.
  ```ini
  # ~/.config/systemd/user/parix-check.timer
  [Timer]
  OnCalendar=*:0/5
  ```
- **cron**: `crontab -e` for user cron, `/etc/cron.d/` for system.
- **at**: `echo "command" | at now + 5 minutes`.
- **systemd oneshot**: `systemd-run --user --on-active=300 /path/to/script`.

### Accessibility (AT-SPI2)
- **Backend**: AT-SPI2 via D-Bus, accessed through `pyatspi2` or `python3-gi` + `Atspi` GObject introspection.
- **Capabilities**: Application registry, accessible tree traversal, role/state/name queries, action invocation, text content reading.
- **Enable**: `gsettings set org.gnome.desktop.interface toolkit-accessibility true`.
- **D-Bus check**: `dbus-send --session --dest=org.a11y.Bus --print-reply /org/a11y/bus org.a11y.Bus.GetAddress`.
- **Dependencies**:
  - Ubuntu/Debian: `apt install at-spi2-core libatspi2.0-dev python3-gi gir1.2-atspi-2.0`
  - Fedora: `dnf install at-spi2-core at-spi2-atk python3-gobject`
  - Arch: `pacman -S at-spi2-core python-gobject`
- **Desktop required**: AT-SPI2 needs a running desktop session (GNOME, KDE, XFCE).
- **Wayland note**: Some compositors have limited AT-SPI2 support — X11 is more reliable.
- **Fallback**: Vision layer (mss/scrot screenshot + Tesseract OCR).

### Notifications
- **notify-send**: `notify-send "Parix" "Task completed"` (requires `libnotify-bin`).
- **node-notifier**: Uses `notify-send` on Linux.
- **D-Bus**: Direct notification via `org.freedesktop.Notifications` interface.
- **Urgency levels**: `notify-send -u critical "Alert"`.

### Package Management

| Distro | Manager | Install | Update | Search |
|--------|---------|---------|--------|--------|
| Ubuntu/Debian | apt | `sudo apt install <pkg>` | `sudo apt update && sudo apt upgrade` | `apt search <pkg>` |
| Fedora | dnf | `sudo dnf install <pkg>` | `sudo dnf upgrade` | `dnf search <pkg>` |
| Arch | pacman | `sudo pacman -S <pkg>` | `sudo pacman -Syu` | `pacman -Ss <pkg>` |
| Universal | snap | `sudo snap install <pkg>` | `sudo snap refresh` | `snap find <pkg>` |
| Universal | flatpak | `flatpak install <pkg>` | `flatpak update` | `flatpak search <pkg>` |

**Detect distro**:
```bash
. /etc/os-release && echo "$ID"  # ubuntu, fedora, arch, debian, etc.
```

### Service Management (systemd)
- **Status**: `systemctl --user status parix-agent`.
- **Start/Stop**: `systemctl --user start|stop|restart parix-agent`.
- **Enable**: `systemctl --user enable parix-agent` (auto-start on login).
- **Logs**: `journalctl --user -u parix-agent -f`.
- **Linger**: `loginctl enable-linger $USER` (keep user services running after logout).

### Security & Permissions
- **sudo**: Required for system-level operations. Never store sudo password.
- **Capabilities**: Prefer `setcap` over full root when possible.
- **SELinux** (Fedora): `getenforce`, `sestatus`. May need context for custom binaries.
- **AppArmor** (Ubuntu): `aa-status`. Check profiles for restricted apps.
- **Firewall**: `ufw` (Ubuntu), `firewalld` (Fedora), `iptables` (universal).
- **File permissions**: `chmod`, `chown`. Parix runs as unprivileged user.

### Linux-Specific Features
- **Clipboard**: `xclip -selection clipboard` (X11), `wl-copy`/`wl-paste` (Wayland).
- **Screenshot**: `scrot /tmp/shot.png` (X11), `grim` (Wayland), `gnome-screenshot`.
- **Display server detect**: `echo $XDG_SESSION_TYPE` → `x11` or `wayland`.
- **Desktop detect**: `echo $XDG_CURRENT_DESKTOP` → `GNOME`, `KDE`, `XFCE`, etc.
- **xdotool** (X11): Window focus, key simulation, mouse control.
- **ydotool** (Wayland): Wayland-compatible input simulation.
- **DBus**: `dbus-send`, `gdbus` for interprocess communication.

### Environment Variables
- **Read**: `echo $VARNAME`, `printenv`.
- **Set session**: `export VARNAME="value"`.
- **Set persistent**: Add to `~/.bashrc`, `~/.profile`, or `~/.pam_environment`.
- **systemd env**: `Environment=KEY=VALUE` in unit file.
- **XDG dirs**: `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_RUNTIME_DIR`.

## Skill Routing

When `process.platform === 'linux'` or `sys.platform.startswith('linux')`:

| Task Type | Tool | Example |
|-----------|------|---------|
| Run command | bash | `bash -c "command"` |
| File operations | Node fs / coreutils | `cp`, `mv`, `rm` |
| System health | /proc + sysctl | `free -h`, `df -h` |
| System logs | journalctl | `journalctl --user -u parix-agent` |
| Install software | apt/dnf/pacman | Detect distro first |
| Schedule task | systemd timer | `~/.config/systemd/user/` |
| UI inspection | AT-SPI2 | `pyatspi2` via D-Bus |
| Notifications | notify-send | `notify-send "title" "body"` |
| Clipboard | xclip/wl-copy | Detect X11 vs Wayland |
| Screenshot | scrot/grim | Detect display server |
| Service control | systemctl | `systemctl --user restart parix-agent` |

## Limitations

- AT-SPI2 requires a running desktop session — headless servers won't have it.
- Wayland has limited automation support compared to X11.
- `pywinauto` and `pyobjc` are not available — Linux uses AT-SPI2 only.
- `sudo` operations require user approval — Parix never stores root credentials.
- Snap/Flatpak apps may have restricted filesystem access (sandboxed).
- PulseAudio/PipeWire quirks can affect notification sounds.
- Different distros have different default packages — always detect before assuming.
