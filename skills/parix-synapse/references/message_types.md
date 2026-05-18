# Synapse Protocol Message Types — Quick Reference

## Message Catalog

| Type | Direction | Required Fields | Purpose |
|------|-----------|----------------|---------|
| `TASK_REQUEST` | Atrium -> Hands | task_id, type, payload, timestamp | Request action execution |
| `TASK_ACK` | Hands -> Atrium | task_id, status, timestamp | Acknowledge receipt |
| `TASK_RESULT` | Hands -> Atrium | task_id, success, output, error, timestamp | Return result |
| `SENSOR_EVENT` | Hands -> Atrium | event_type, data, confidence, timestamp | Push observation |
| `HEARTBEAT` | Bidirectional | timestamp | Keep-alive |
| `REBOOT_SYNC` | Hands -> Atrium | timestamp | Hands restarted |
| `WORLD_STATE_PUSH` | Atrium -> Hands | last_task, active_state, timestamp | Push Council state |
| `CAPABILITY_MISSING` | Atrium -> Hands | capability, message | Feature unavailable |

## ACK Timeout Behavior

```
Send TASK_REQUEST
  -> Wait for TASK_ACK (default timeout)
  -> Retry: 200ms -> 400ms -> 800ms -> ... (exponential backoff)
  -> Max retries exhausted -> PARALYZED state
  -> Dead-letter queue picks up task
  -> User notified via channel
```

## Reconnect Sequence

```
Atrium detects disconnect
  -> Reconnect loop: 1s -> 2s -> 4s -> max 30s
  -> On reconnect: wait for REBOOT_SYNC from Hands
  -> Send WORLD_STATE_PUSH (last_task + Council state)
  -> Resume queue processing
```

## Key Files

| File | Role |
|------|------|
| `shared/protocol.json` | Single source of truth for schema |
| `atrium/src/synapse/client.ts` | WS client, ACK tracker |
| `hands/main.py` | WS server, message dispatch |
| `hands/protocol.py` | Python dataclasses mirroring protocol.json |
