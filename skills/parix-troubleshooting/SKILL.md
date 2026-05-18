---
name: parix-troubleshooting
description: Parix Skill — Troubleshooting & Debugging
---

# Parix Skill — Troubleshooting & Debugging

> Use when diagnosing issues with a running or failed Parix stack.

## Quick Diagnostics

```bash
# Check all services
npx pm2 status

# View recent logs (all services)
npx pm2 logs --nostream --lines 50

# Health check (non-interactive)
python hands/hatchery.py --check

# Check ports
netstat -ano | findstr "8765 8766 3000"
```

## Service Ports

| Service | Port | Process |
|---------|------|---------|
| Hands Synapse | 8765 | Python WS server |
| Aegis Relay | 8766 | Node.js WS server (inside Atrium) |
| Aegis UI | 3000 | Vite dev server |

## Common Issues

### Atrium can't connect to Hands
**Symptom:** Atrium logs show "WebSocket connection failed" repeatedly.
**Cause:** Hands isn't running or port 8765 is blocked.
**Fix:**
```bash
npx pm2 restart parix-hands
npx pm2 logs parix-hands --nostream --lines 20
```

### Hands crashes on startup
**Symptom:** `parix-hands` shows status "errored" in PM2.
**Cause:** Missing Python dependencies or port conflict.
**Fix:**
```bash
pip install -r hands/requirements.txt
# Check for port conflicts
netstat -ano | findstr 8765
```

### Aegis dashboard blank
**Symptom:** `http://localhost:3000` shows white page.
**Cause:** Vite not running or Aegis relay (8766) not available.
**Fix:**
```bash
npx pm2 restart parix-aegis
npx pm2 logs parix-aegis --nostream --lines 20
```

### Council stuck in ACTING state
**Symptom:** Council never returns to IDLE.
**Cause:** Task sent to Hands but no TASK_RESULT received (Hands crashed mid-task).
**Fix:**
```bash
# Check for pending tasks
npx pm2 logs parix-atrium --nostream --lines 30
# Restart both — REBOOT_SYNC will clean up
npx pm2 restart parix-hands parix-atrium
```

### LLM calls failing
**Symptom:** Council falls back to rule-based planning for everything.
**Cause:** No API keys configured or daily token budget exhausted.
**Fix:**
```bash
# Check .env for API keys
cat .env | grep -i "api_key"
# Check governor stats via Aegis or stdin
# Type "status" into Atrium stdin
```

### Ghost tasks after crash
**Symptom:** Tasks execute twice or stale tasks run.
**Cause:** Hands restarted but Atrium didn't receive REBOOT_SYNC.
**Fix:** Restart both services together:
```bash
npx pm2 restart parix-hands parix-atrium
```

### SQLite "database is locked"
**Symptom:** sql.js throws SQLITE_BUSY errors.
**Cause:** Multiple Atrium instances running.
**Fix:**
```bash
npx pm2 delete parix-atrium
npx pm2 start ecosystem.config.js --only parix-atrium
```

### platform.py import errors
**Symptom:** `AttributeError: module 'platform' has no attribute 'machine'`
**Cause:** `hands/platform.py` shadows Python's stdlib `platform` module.
**Fix:** Never use `import platform` in Hands code. Use `sys.platform` and env var fallbacks instead. See `platform.py` header comments.

## Log Locations

| Service | PM2 Log Path |
|---------|-------------|
| Hands | `~/.pm2/logs/parix-hands-out.log` |
| Atrium | `~/.pm2/logs/parix-atrium-out.log` |
| Aegis | `~/.pm2/logs/parix-aegis-out.log` |

## Stdin IPC Commands

Type these into the Atrium process stdin (or via PM2 attach):

| Command | Effect |
|---------|--------|
| `pause` | Pause Council processing |
| `resume` | Resume Council processing |
| `status` | Print current state + queue depth |
| `why` / `explain` | Explain last action |
| `history` | Print last 10 audit entries |

## E2E Integration Test

```bash
npm run test:e2e
```

Boots Hands → Atrium → tests sensor pipeline → Aegis relay → pause/resume. 10 assertions.
