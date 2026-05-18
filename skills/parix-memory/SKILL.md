---
name: parix-memory
description: Parix Skill — Memory & Storage
---

# Parix Skill — Memory & Storage

> Use when working with SQLite, the audit ledger, episodic memory, context fusion, surprise tracking, or cloud storage sync.

## SQLite Setup

Parix uses **sql.js** (pure WASM SQLite), NOT better-sqlite3. This avoids native compilation issues across platforms.

```typescript
import initSqlJs from 'sql.js';
const SQL = await initSqlJs();
const db = new SQL.Database(readFileSync('data/parix.db'));
```

Database file location: `data/parix.db`

## Schema (`shared/schema.sql`)

Key tables:

| Table | Purpose |
|-------|---------|
| `events` | Sensor events received from Hands |
| `tasks` | Task requests sent to Hands + results |
| `audit_ledger` | Every action/decision/state change |
| `skill_cache` | Pattern → solution mappings |
| `token_usage` | LLM token consumption per call |
| `daily_summary` | Aggregated daily token/action stats |
| `checkpoints` | Council state snapshots for crash recovery |
| `episodes` | v0.2 episodic memory sequences |
| `event_sequences` | v0.2 learned A→B→C event patterns |
| `surprises` | v0.2 novel event / sequence break log |

## v0.2 Intelligence Tables

### Episodic Memory (`episodes.ts`)
Records event+action sequences as "episodes." Auto-closes after 5 minutes of inactivity.

```typescript
recordActivity(eventType, action, details)  // append to current episode
closeEpisode()                               // persist to DB
recall(query)                                // search past episodes
```

### Context Fusion (`situations.ts`)
2-minute sliding window signal buffer. Fuses concurrent events into "situations":

| Situation | Signals |
|-----------|---------|
| `system_overload` | cpu_high + memory_high |
| `system_dying` | battery_low + disk_low |
| `connectivity_cascade` | wifi_disconnected + app_crash |
| `debug_session` | terminal_error + cpu_high |
| `storage_migration` | usb_storage_connected + disk_low |
| `degraded_idle` | multiple warning-level events |

### Surprise Tracking (`surprises.ts`)
Detects novel event types and sequence breaks. Learns A→B→C patterns.

```typescript
observeEvent(eventType)     // check if novel or sequence break
observeOutcome(expected, actual) // track unexpected success/failure
learnSequence(events[])     // store new pattern
```

## Cloud Storage Sync

Storage adapters in `atrium/src/storage/adapters/` sync SQLite backups:

**Zero-config:** Local filesystem (always on)

**Cloud providers:** OneDrive, Azure Blob, Google Drive, GCS, iCloud, Dropbox, Box, MEGA, Proton Drive, pCloud, Sync.com

All uploads use AES-256 client-side encryption (`encryption.ts`) before transit.

## Key Files

| File | Purpose |
|------|---------|
| `atrium/src/memory/db.ts` | SQLite wrapper (sql.js) |
| `shared/schema.sql` | Table definitions |
| `atrium/src/intelligence/audit.ts` | Audit ledger writer |
| `atrium/src/intelligence/episodes.ts` | Episodic memory |
| `atrium/src/intelligence/situations.ts` | Context fusion |
| `atrium/src/intelligence/surprises.ts` | Surprise tracking |
| `atrium/src/storage/` | Cloud sync adapters |
