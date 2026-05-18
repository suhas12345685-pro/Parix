---
name: parix-operations
description: Parix Skill — Runtime Operations & Debugging
---

# Parix Skill — Runtime Operations & Debugging

> Use when starting, stopping, inspecting, or debugging a running Parix stack across Hands, Atrium, and Aegis.

## Local PM2 Runtime

Start:
```bash
npm start
```

Inspect:
```bash
npx pm2 status
npx pm2 logs --nostream --lines 80
```

Persist process list:
```bash
npx pm2 save
```

## Health Checks

Hands onboarding check:
```bash
python hands/hatchery.py --check
```

Aegis HTTP check:
```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:3000 -TimeoutSec 5
```

Expected ports:

| Service | Port |
|---|---:|
| Hands Synapse | 8765 |
| Aegis relay | 8766 |
| Aegis UI | 3000 |

## Common Failures

### Atrium briefly disconnects at startup

Hands may start a second later than Atrium. A reconnect followed by `REBOOT_SYNC` and `WORLD_STATE_PUSH` is healthy.

### Aegis fails under PM2 on Windows

Use Vite's JS entrypoint, not the Unix `.bin/vite` shim:
```js
script: path.join(PARIX_HOME, 'node_modules', 'vite', 'bin', 'vite.js')
```

### Hatchery Unicode errors on Windows

Ensure `hands/hatchery.py` reconfigures `stdout` and `stderr` to UTF-8 before printing box drawing or status symbols.

### Accessibility missing on Windows

Install:
```bash
python -m pip install pywinauto
```

Then rerun:
```bash
python hands/hatchery.py --check
```
