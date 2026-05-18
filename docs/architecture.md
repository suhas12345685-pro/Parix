# Parix Architecture

Parix is split into four workspaces plus shared contracts. Atrium owns the
agent brain, Hands owns local OS sensing and execution, Aegis renders live
state, and Hatchery handles first-run setup.

## Runtime Map

```text
User
  |
  v
Hatchery onboarding
  |
  v
Aegis dashboard <-- ws://localhost:8766 --> Atrium brain
                                                |
                                                v
                                      SQLite/sql.js memory
                                                |
                                                v
Hands executor/sensors <-- ws://localhost:8765 --+
```

## Cognition Loop

```text
sensor event
  |
  v
attention gate
  | admitted
  v
working memory + user preferences + world facts
  |
  v
desire inference
  |
  v
hypothesis generation
  |
  v
metacognition strategy
  |
  v
planner goal tree
  |
  v
horizon coherence check
  |
  v
simulate + critique
  |
  v
council execution
  |
  v
learning, calibration, skill cache, narrative attempts
```

## Layers

`shared/` is the contract layer. It contains the WebSocket protocol, SQLite
DDL, channel registry, and onboarding schema consumed by the other packages.

`atrium/` is the reasoning layer. It receives events from Hands, gates them
through cognition, routes plans through the Council state machine, persists
memory, and relays dashboard snapshots to Aegis.

`hands/` is the operator layer. It watches local OS signals, sends sensor
events to Atrium, acknowledges task requests, and executes approved CLI or
vision tasks.

`aegis/` is the visibility layer. It subscribes to Atrium's relay and shows
runtime state, cognition state, event history, channels, cron jobs, skills,
settings, and diagnostics.

`hatchery/` is the setup layer. It collects mode, secrets, surveillance
scope, and onboarding state so a fresh machine can reach a runnable Parix
profile.

## Cognition Modules

The v1.3 cognition upgrade adds four systems:

- Attention decides whether an event deserves processing.
- Metacognition chooses reflex, deliberate, ask-user, defer, or delegate mode.
- Planner decomposes desires into `GoalTree` and `PlanNode` work.
- Horizon tracks multi-session narratives and prevents repeated failed
  approaches.

For tuning details and thresholds, see [cognition.md](./cognition.md).
