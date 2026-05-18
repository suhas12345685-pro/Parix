# Linux Distro Command Reference for Parix

## Package Management by Distro

### Ubuntu / Debian (apt)

| Command | Description |
|---------|-------------|
| `sudo apt update` | Refresh package index |
| `sudo apt install <pkg>` | Install package |
| `sudo apt remove <pkg>` | Remove package |
| `sudo apt upgrade` | Upgrade all packages |
| `apt search <pkg>` | Search packages |
| `apt list --installed` | List installed |
| `dpkg -l \| grep <pkg>` | Check if installed |

### Fedora (dnf)

| Command | Description |
|---------|-------------|
| `sudo dnf install <pkg>` | Install package |
| `sudo dnf remove <pkg>` | Remove package |
| `sudo dnf upgrade` | Upgrade all |
| `dnf search <pkg>` | Search packages |
| `dnf list installed` | List installed |

### Arch (pacman)

| Command | Description |
|---------|-------------|
| `sudo pacman -S <pkg>` | Install package |
| `sudo pacman -R <pkg>` | Remove package |
| `sudo pacman -Syu` | Full system upgrade |
| `pacman -Ss <pkg>` | Search packages |
| `pacman -Q` | List installed |

## System Monitoring

| Command | Description |
|---------|-------------|
| `free -h` | Memory usage |
| `df -h` | Disk usage |
| `lsblk` | Block devices |
| `nproc` | CPU count |
| `lscpu` | CPU details |
| `uptime` | Load average + uptime |
| `ip addr` | Network interfaces |
| `ss -tlnp` | Listening ports |
| `sensors` | Temperature (lm-sensors) |
| `nvidia-smi` | GPU stats (NVIDIA) |

## Service Management (systemd)

| Command | Description |
|---------|-------------|
| `systemctl --user status svc` | Check service status |
| `systemctl --user start svc` | Start service |
| `systemctl --user stop svc` | Stop service |
| `systemctl --user restart svc` | Restart service |
| `systemctl --user enable svc` | Enable at login |
| `journalctl --user -u svc -f` | Follow logs |
| `loginctl enable-linger $USER` | Keep running after logout |

## Logs

| Command | Description |
|---------|-------------|
| `journalctl --since "5 min ago"` | Recent entries |
| `journalctl -k` | Kernel messages |
| `journalctl -p err` | Errors only |
| `dmesg --level=err` | Kernel errors |
| `tail -f /var/log/syslog` | Syslog (Debian/Ubuntu) |

## Display Server Detection

| Variable / Command | Result |
|--------------------|--------|
| `echo $XDG_SESSION_TYPE` | `x11` or `wayland` |
| `echo $XDG_CURRENT_DESKTOP` | `GNOME`, `KDE`, `XFCE`, etc. |
| `loginctl show-session $(loginctl \| grep $USER \| awk '{print $1}') -p Type` | Session type |

## Clipboard

| Display | Copy | Paste |
|---------|------|-------|
| X11 | `xclip -selection clipboard` | `xclip -selection clipboard -o` |
| Wayland | `wl-copy` | `wl-paste` |

## Screenshot

| Display | Command |
|---------|---------|
| X11 | `scrot /tmp/shot.png` |
| Wayland | `grim /tmp/shot.png` |
| GNOME | `gnome-screenshot -f /tmp/shot.png` |

## Firewall

| Distro | Command |
|--------|---------|
| Ubuntu | `sudo ufw status`, `sudo ufw allow 8080/tcp` |
| Fedora | `sudo firewall-cmd --list-all`, `sudo firewall-cmd --add-port=8080/tcp` |
| Generic | `sudo iptables -L -n` |
