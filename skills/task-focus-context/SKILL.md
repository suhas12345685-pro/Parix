---
name: task-focus-context
description: Triggered when the user switches focused application. Classifies the context (editor, terminal, chat, etc.) and emits a hint about what kind of proactive help is useful here.
---

# Focus Context

> Use whenever the user's focused application changes. Classifies the
> context and emits a hint about what kind of proactive help is
> likely useful in that context — without acting on it directly.

## Trigger pipeline

This skill is the *first* responder skill that relies on the
accessibility moat:

```
hands/accessibility/<platform>.py reports focused app/element
        ↓
hands/sensors/a11y_poller.py wraps it as ACCESSIBILITY_SNAPSHOT
        ↓ on focused_app transition only (not element changes)
hands/sensors/a11y_poller.py ALSO emits SENSOR_EVENT(focus_change)
        ↓ synapse WS
atrium council.matchSkills → this skill
        ↓
emits {contextKind, appFamily, helpfulnessHint, shouldDeferAction}
```

Element changes within the same app do not trigger this skill —
only true app transitions. That's the debounce that keeps it from
firing on every typed character.

## What `helpfulnessHint` is for

The output is *advisory* to the council. The council can use the
hint to decide:

- Whether to surface a notification right now or hold it.
- Which other skills are likely useful to pre-warm.
- Whether to switch the agent's attention focus.

It is **not** auto-applied. This skill stays advisory — actuation
happens in downstream skills the user has opted into.

## `shouldDeferAction`

True when the user is in a deep-focus context:
- Coding (vscode, jetbrains, sublime, etc.) — interrupting a typing
  flow is expensive.
- On a call (zoom, teams, meet, slack call) — never interrupt.
- Recording or streaming (obs, screen-recorders).

False for terminals, browsers, chat clients, file managers — these
are low-cost interruption surfaces.

## Permission

`accessibility:read` — but only because the event input may
embed a focused element. The skill never re-reads the
accessibility tree; it acts on whatever the sensor already passed.
