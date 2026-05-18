---
name: task-process-mgmt
description: Skill — Process Management
---

# Skill — Process Management

> Triggered on `cpu_high`, `memory_high`, `app_hang`, `app_crash`, or `service_down` events.

## Principles

1. **Observe first, act second.** High CPU for 5 seconds is normal during builds. Sustained > 90% for 60+ seconds is a problem.
2. **Never kill user processes without confirmation.** Only restart managed services (systemd, launchd, Docker containers, PM2 processes).
3. **Notification is the default.** Only auto-restart if the service is one Parix manages or is in a known-safe list.

## Diagnostic Commands

### Identify Top Consumers

Windows:
```powershell
Get-Process | Sort-Object CPU -Descending | Select-Object -First 10 Name, Id, CPU, WorkingSet64
```

macOS/Linux:
```bash
ps aux --sort=-%cpu | head -15
```

### Memory Pressure

```bash
free -h          # Linux
vm_stat          # macOS
```

## Auto-Restart (Safe List)

These services can be safely restarted without user confirmation:
- `docker`, `containerd` — container runtime
- `postgresql`, `mysql`, `redis`, `mongodb` — local dev databases
- `nginx`, `apache2`, `httpd` — local dev servers
- PM2-managed processes — `pm2 restart <name>`

## Kill Guidance

For `app_hang` events:
1. First attempt: send SIGTERM (graceful shutdown)
2. Wait 10 seconds
3. If still running: notify user and suggest force kill
4. Never auto-send SIGKILL — that's the user's decision

## Reversibility

- Restarting a service: 0.7 (usually recoverable, may lose in-flight work)
- Killing a process: 0.2 (data loss possible)
- Notification only: 1.0 (no action taken)
