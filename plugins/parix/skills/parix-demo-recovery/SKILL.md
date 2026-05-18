---
name: parix-demo-recovery
description: Verify Parix demo readiness, Synapse bridge health, kill/restart recovery, and expected local ports. Use when preparing demos, debugging Hands/Atrium startup, checking crash recovery, or writing demo scripts.
---

# Parix Demo Recovery

## Workflow

1. Read `shared/protocol.json`, `hands/main.py`, `atrium/src/synapse/client.ts`, and `atrium/src/memory/db.ts`.
2. Confirm ports before launching: Synapse `8765`, Aegis relay `8766`, Aegis UI `3000`.
3. Start Hands before Atrium when testing the bridge manually.
4. Verify `TASK_REQUEST -> TASK_ACK -> TASK_RESULT` and `REBOOT_SYNC -> WORLD_STATE_PUSH`.
5. Check SQLite state for ghost pending tasks after restarts.
6. Keep demo scripts deterministic and Windows-friendly unless the user asks for another OS.

## Script

Use `scripts/check_layout.py` for a fast preflight that checks required files and protocol ports before deeper runtime testing.

```powershell
python plugins\parix\skills\parix-demo-recovery\scripts\check_layout.py
```
