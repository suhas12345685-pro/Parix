# Parix SQLite Schema — Quick Reference

## Core Tables

| Table | Key Columns | Purpose |
|-------|-------------|---------|
| `events` | id, event_type, data, confidence, ts | Sensor events from Hands |
| `tasks` | task_id, type, payload, success, output, ts | Task requests + results |
| `audit_ledger` | ts, actor, action, payload | All decisions and state changes |
| `skill_cache` | pattern, solution, hit_count, last_used | Pattern-to-solution cache |
| `token_usage` | call_id, provider, model, tokens_in, tokens_out, ts | LLM token tracking |
| `daily_summary` | date, total_tokens, total_actions, total_events | Aggregated daily stats |
| `checkpoints` | ts, council_state, active_task, queue_size | Crash recovery snapshots |

## v0.2 Intelligence Tables

| Table | Key Columns | Purpose |
|-------|-------------|---------|
| `episodes` | id, events_json, actions_json, started_at, closed_at | Event+action sequences |
| `event_sequences` | pattern, frequency, last_seen | Learned A->B->C patterns |
| `surprises` | event_type, reason, ts | Novel events + sequence breaks |

## Engine Details

- **sql.js** (WASM SQLite) -- no native compilation needed
- Database file: `data/parix.db`
- Schema source: `shared/schema.sql`

## Cloud Sync Adapters

All adapters encrypt with AES-256 before upload.

| Provider | Adapter File |
|----------|-------------|
| Local filesystem | Always active |
| OneDrive | `atrium/src/storage/adapters/onedrive.ts` |
| Google Drive | `atrium/src/storage/adapters/gdrive.ts` |
| Dropbox | `atrium/src/storage/adapters/dropbox.ts` |
| Azure Blob | `atrium/src/storage/adapters/azure-blob.ts` |
| GCS | `atrium/src/storage/adapters/gcs.ts` |
| iCloud | `atrium/src/storage/adapters/icloud.ts` |
