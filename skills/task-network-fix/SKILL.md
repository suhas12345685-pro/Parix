---
name: task-network-fix
description: Skill — Network Troubleshooting
---

# Skill — Network Troubleshooting

> Triggered on `wifi_disconnected`, `wifi_weak_signal`, `ECONNREFUSED`, or connectivity cascade situations.

## Diagnostic Steps

1. **Ping gateway** — `ping -c 3 $(ip route | grep default | awk '{print $3}')` (Linux/macOS) or `ping -n 3 (Get-NetRoute -DestinationPrefix 0.0.0.0/0).NextHop` (Windows).
2. **DNS resolution** — `nslookup google.com` to check if DNS is working.
3. **Interface status** — check if the adapter is up at all.

## Recovery Commands

### Wi-Fi Reconnect

Windows:
```powershell
netsh wlan disconnect
Start-Sleep -Seconds 2
netsh wlan connect name="$LAST_SSID"
```

macOS:
```bash
networksetup -setairportpower en0 off
sleep 2
networksetup -setairportpower en0 on
```

Linux:
```bash
nmcli radio wifi off && sleep 2 && nmcli radio wifi on
# or
nmcli device wifi connect "$LAST_SSID"
```

### DNS Flush

Windows: `ipconfig /flushdns`
macOS: `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder`
Linux: `systemd-resolve --flush-caches 2>/dev/null || resolvectl flush-caches`

## Safety

- Wi-Fi toggle is reversible (score: 0.8)
- DNS flush is harmless (score: 1.0)
- Never change network configuration files or modify `/etc/resolv.conf`
- Never store or transmit Wi-Fi passwords

## Escalation

If reconnect fails 3 times, notify the user with diagnostic output rather than continuing to retry.
