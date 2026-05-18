---
name: parix-synapse
description: Parix Skill — Synapse Bridge Protocol
---

# Parix Skill — Synapse Bridge Protocol

> Use when working on the WebSocket bridge between Atrium (Node.js brain) and Hands (Python executor).

## Architecture

```
┌──────────────┐   WebSocket (8765)   ┌──────────────┐
│   Atrium     │◄───────────────────► │    Hands     │
│   (Node.js)  │   WS Client          │   (Python)   │
│   synapse/   │                      │   main.py    │
│   client.ts  │                      │   WS Server  │
└──────────────┘                      └──────────────┘
```

- **Hands** runs the WebSocket **server** on port `8765`
- **Atrium** connects as a **client** via `synapse/client.ts`
- Protocol defined in `shared/protocol.json`

## Message Types

| Type | Direction | Fields | Purpose |
|------|-----------|--------|---------|
| `TASK_REQUEST` | Atrium → Hands | task_id, type, payload, timestamp | Request action execution |
| `TASK_ACK` | Hands → Atrium | task_id, status, timestamp | Acknowledge task receipt |
| `TASK_RESULT` | Hands → Atrium | task_id, success, output, error, timestamp | Return execution result |
| `SENSOR_EVENT` | Hands → Atrium | event_type, data, confidence, timestamp | Push sensor observation |
| `HEARTBEAT` | Both | timestamp | Keep-alive ping |
| `REBOOT_SYNC` | Hands → Atrium | timestamp | Python restarted, request world state |
| `WORLD_STATE_PUSH` | Atrium → Hands | last_task, active_state, timestamp | Push current Council state |
| `CAPABILITY_MISSING` | Atrium → Hands | capability, message | Required OS feature unavailable |

## ACK Tracker

Every `TASK_REQUEST` expects a `TASK_ACK` within a timeout window. If no ACK arrives:

1. Exponential backoff retry (200ms → 400ms → 800ms → …)
2. After max retries, task enters `PARALYZED` state
3. Dead-letter queue picks up paralyzed tasks
4. User notified via active channel

## Reconnect Behavior

```
Atrium detects disconnect
  → enters reconnect loop (1s → 2s → 4s → max 30s)
  → on reconnect, waits for REBOOT_SYNC from Hands
  → sends WORLD_STATE_PUSH with last_task + active Council state
  → resumes queue processing
```

## Key Files

| File | Role |
|------|------|
| `atrium/src/synapse/client.ts` | WS client, ACK tracker, reconnect loop |
| `hands/main.py` | WS server, message dispatch, sensor thread startup |
| `hands/protocol.py` | Python dataclasses mirroring protocol.json |
| `shared/protocol.json` | Single source of truth for message schema |

## Testing

```bash
# Integration test — full roundtrip
npx vitest run atrium/tests/integration/synapse.test.ts

# Python bridge tests
pytest -q hands/tests/test_bridge.py
```

## Common Issues

- **Port 8765 already in use**: Another Hands instance is running. Kill it with `npx pm2 delete parix-hands` or check `netstat -ano | findstr 8765`.
- **Hands starts after Atrium**: Normal. Atrium reconnect loop handles this. Look for `REBOOT_SYNC` + `WORLD_STATE_PUSH` in logs.
- **ACK never arrives**: Check Hands logs for exceptions in task dispatch. Verify `protocol.py` matches `protocol.json`.
