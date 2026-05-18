# Network Troubleshooting Quick Reference

## Diagnostic Sequence

1. Ping gateway (local network)
2. Ping external IP (8.8.8.8 - internet)
3. DNS lookup (nslookup google.com)
4. Check interface status

## DNS Flush Commands

| OS | Command |
|---|---|
| Windows | `ipconfig /flushdns` |
| macOS | `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder` |
| Linux (systemd) | `resolvectl flush-caches` |

## Wi-Fi Toggle Commands

| OS | Off | On |
|---|---|---|
| Windows | `netsh wlan disconnect` | `netsh wlan connect name="SSID"` |
| macOS | `networksetup -setairportpower en0 off` | `networksetup -setairportpower en0 on` |
| Linux | `nmcli radio wifi off` | `nmcli radio wifi on` |

## Common Port Checks

| Service | Port | Test Command |
|---|---|---|
| HTTP | 80 | `curl -I http://localhost` |
| HTTPS | 443 | `curl -I https://localhost` |
| SSH | 22 | `ssh -v localhost` |
| PostgreSQL | 5432 | `pg_isready` |
| MySQL | 3306 | `mysqladmin ping` |
| Redis | 6379 | `redis-cli ping` |

## Reversibility Scores

| Action | Score | Notes |
|---|---|---|
| DNS flush | 1.0 | Harmless, cache rebuilds |
| Wi-Fi toggle | 0.8 | Reconnects automatically |
| Config change | 0.3 | Avoid without user OK |
