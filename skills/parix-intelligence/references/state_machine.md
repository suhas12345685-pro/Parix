# Council State Machine — Quick Reference

## States

```
IDLE --> OBSERVING --> THINKING --> ACTING --> WAITING --> IDLE
  ^                                              |
  +------------------ ERROR <--------------------+
```

| State | Description | Next States |
|-------|-------------|-------------|
| IDLE | No active work, queue may have items | OBSERVING |
| OBSERVING | Evaluating sensor event significance | THINKING, IDLE |
| THINKING | Building action plan (local or LLM) | ACTING, WAITING, ERROR |
| ACTING | Executing plan via Hands | IDLE, ERROR |
| WAITING | Awaiting user confirmation | ACTING, IDLE |
| ERROR | Failure occurred, auto-recovers | IDLE |

## Governor Rate Limits

| Limit | Default | Config Key |
|-------|---------|------------|
| Actions per minute | 5 | `governor.actionsPerMinute` |
| Actions per hour | 60 | `governor.actionsPerHour` |
| Daily token budget | 100,000 | `governor.dailyTokenBudget` |

## Reversibility Score Ranges

| Score | Action | Example |
|-------|--------|---------|
| 0.0 - 0.3 | Block + confirm | `rm -rf`, `git push --force` |
| 0.3 - 0.7 | Allow + audit | `npm install`, `git commit` |
| 0.7 - 1.0 | Auto-approve | `git status`, `ps aux` |

## Key Components

| Component | File | Purpose |
|-----------|------|---------|
| Council | `council.ts` | State machine + event routing |
| Constitution | `constitution.ts` | Blocked/allowed command rules |
| Governor | `governor.ts` | Rate limiting |
| Reversibility | `reversibility.ts` | Command risk scoring |
| Skill Cache | `skillcache.ts` | Pattern -> solution cache |
| Explainability | `explainability.ts` | Decision chain reconstruction |
| Dead Letter | `deadletter.ts` | Failed task retry queue |
| Watchdog | `watchdog.ts` | Crash recovery checkpoints |
| Pause | `pause.ts` | Pause/resume with queue buffering |
