---
name: parix-intelligence
description: Parix Skill — Intelligence Layer
---

# Parix Skill — Intelligence Layer

> Use when working on the Council state machine, safety rules, rate limiting, skill caching, explainability, or pause functionality.

## Council State Machine

The Council is Parix's core decision engine in `atrium/src/intelligence/council.ts`.

```
IDLE ──► OBSERVING ──► THINKING ──► ACTING ──► WAITING ──► IDLE
  ▲                                                │
  └──────────── ERROR ◄────────────────────────────┘
```

| State | Description |
|-------|-------------|
| `IDLE` | No active work. Queue may have pending items. |
| `OBSERVING` | Received sensor event, evaluating significance. |
| `THINKING` | Building action plan (local rules or LLM). |
| `ACTING` | Executing plan via Hands. |
| `WAITING` | Awaiting user confirmation for irreversible actions. |
| `ERROR` | Something failed. Auto-recovers to IDLE after logging. |

### Pause Awareness

When paused (`pause.ts`), `processQueue()` short-circuits immediately. No events are dropped — they queue up and process on resume.

## Constitution (`constitution.ts`)

Hard safety rules that gate **every** action before execution.

### Blocked Commands (always require confirmation)
- Destructive filesystem ops on broad paths (`rm -rf /`, `del /s /q C:\`)
- Privilege escalation (`sudo`, `runas`)
- OS shutdown/reboot
- Registry/system directory deletion
- Credential reads / env dumps with secrets
- Force push, `git reset --hard`
- Terraform/K8s destructive operations

### Allowed Commands (auto-approved)
- `npm test`, `pytest`, `tsc`, `git status/diff/log`
- Process listing, service status checks
- Disk/CPU/memory/battery reads
- Local notifications

### Adding Rules
1. Add regex + reason to `BLOCKED_COMMANDS` or `DOMAIN_BLOCKED_COMMANDS`
2. Add test in `atrium/src/intelligence/__tests__/constitution.test.ts`
3. Include one positive test proving nearby safe commands still pass

## Governor (`governor.ts`)

Rate limiting to prevent runaway LLM costs or action storms.

| Limit | Default |
|-------|---------|
| Actions per minute | 5 |
| Actions per hour | 60 |
| Daily token budget | 100,000 |

The governor checks limits before every LLM call and before every action execution.

## Reversibility Scorer (`reversibility.ts`)

Scores commands 0.0 (irreversible) to 1.0 (fully reversible). 35+ CLI patterns.

- Score < 0.3 → Block, require user confirmation
- Score 0.3–0.7 → Allow with audit trail
- Score > 0.7 → Auto-approve

## Skill Cache (`skillcache.ts`)

Pattern → solution mapping stored in SQLite. When Parix solves a problem, it caches the pattern:

```
event_pattern → solution_template → skip LLM next time
```

Reduces LLM calls for repeated problems. Uses `INSERT ON CONFLICT UPDATE` for learning.

## Explainability (`explainability.ts`)

"Why did you do that?" — reconstructs decision chains from the audit ledger.

```typescript
const explanation = await explainAction(taskId);
// Returns: trigger event → constitution check → plan → execution → outcome
```

## Audit Ledger (`audit.ts`)

Every action, decision, and state transition is logged to the `audit_ledger` SQLite table:
- `ts` — timestamp
- `actor` — module that logged it (council, constitution, governor, etc.)
- `action` — what happened
- `payload` — JSON details

## Dead Letter Queue (`deadletter.ts`)

Failed/timed-out tasks go to the DLQ. Retry semantics:
- 3 retries with exponential backoff
- After exhaustion, notify user via active channel
- DLQ entries visible in Aegis dashboard

## Watchdog (`watchdog.ts`)

Periodic state checkpoints. On crash recovery:
1. Reads last checkpoint from SQLite
2. Determines if a task was in-flight
3. Resumes or cancels based on task age

## Key Files

| File | Purpose |
|------|---------|
| `council.ts` | State machine + event routing + LLM planning |
| `constitution.ts` | Safety rules (blocked/allowed command patterns) |
| `governor.ts` | Rate limiting (actions/min, actions/hr, tokens/day) |
| `reversibility.ts` | Command risk scoring (0.0–1.0) |
| `skillcache.ts` | Pattern → solution cache (skip LLM for known fixes) |
| `explainability.ts` | Decision chain reconstruction |
| `pause.ts` | Pause/resume switch with audit logging |
| `audit.ts` | Audit ledger writer |
| `deadletter.ts` | Failed task queue + retry logic |
| `watchdog.ts` | State checkpoint + crash recovery |
| `notify.ts` | Notification dispatch to active channel |
| `episodes.ts` | v0.2 episodic memory |
| `situations.ts` | v0.2 context fusion (multi-signal correlation) |
| `surprises.ts` | v0.2 surprise tracking (novel events + sequence learning) |
