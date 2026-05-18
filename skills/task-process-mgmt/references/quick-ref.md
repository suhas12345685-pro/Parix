# Process Management Quick Reference

## CPU/Memory Thresholds

| Metric | Normal | Warning | Critical |
|---|---|---|---|
| CPU | < 70% | 70-90% sustained 30s | > 90% sustained 60s |
| Memory | < 75% | 75-90% | > 90% |
| Swap | < 20% | 20-50% | > 50% |

## Safe-to-Restart Services

| Service | Restart Command (Linux) | Restart Command (Windows) |
|---|---|---|
| docker | `systemctl restart docker` | `Restart-Service docker` |
| postgresql | `systemctl restart postgresql` | `Restart-Service postgresql*` |
| mysql | `systemctl restart mysql` | `Restart-Service MySQL*` |
| redis | `systemctl restart redis` | `Restart-Service Redis` |
| nginx | `systemctl restart nginx` | `Restart-Service nginx` |
| PM2 apps | `pm2 restart all` | `pm2 restart all` |

## Signal Reference

| Signal | Number | Purpose | Safe? |
|---|---|---|---|
| SIGTERM | 15 | Graceful shutdown | Yes |
| SIGINT | 2 | Interrupt (Ctrl+C) | Yes |
| SIGHUP | 1 | Reload config | Yes |
| SIGKILL | 9 | Force kill | No - user only |

## Kill Sequence

1. `kill <pid>` (SIGTERM) - wait 10s
2. If still alive: notify user
3. User decides: `kill -9 <pid>` (SIGKILL)

## Port Conflict Resolution

```bash
# Find process on port
lsof -i :<port>          # macOS/Linux
netstat -ano | findstr :<port>  # Windows
```
