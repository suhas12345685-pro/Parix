---
name: task-terminal-error-resolver
description: Classifies a terminal error from the os-sensors `terminal_error` feed and suggests a likely fix. Read-only — produces a structured suggestion, never runs the fix.
---

# Terminal Error Resolver

> Use when the agent has seen a `terminal_error` sensor event and the
> user is likely to want a one-line suggestion of what to try next.

## What it does

Reads the terminal output that tripped the `terminal_error` sensor
(last ~4 KB) and classifies the error into a known family:

- **npm / node** — missing module, version mismatch, ENOENT on
  `package-lock.json`, port-in-use.
- **python** — `ModuleNotFoundError`, `ImportError`, `IndentationError`,
  uncaught traceback.
- **git** — non-fast-forward, untracked files would be overwritten,
  detached HEAD, merge conflict markers.
- **docker** — daemon not running, image not found, port collision,
  `permission denied` on the socket.
- **port-in-use** — `EADDRINUSE`, "address already in use".
- **permission** — `EACCES`, "permission denied".
- **network** — `ECONNREFUSED`, DNS lookup failed.
- **disk** — `ENOSPC`, "No space left on device".
- **generic** — none of the above; falls back to a heuristic.

Each classification produces a structured suggestion with:
- `category` — which family.
- `cause` — one-sentence human-readable summary.
- `suggestedFix` — a concrete next command or step.
- `confidence` — 0..1.
- `safeToAutoFix` — true only for the small set of obviously
  reversible suggestions (currently almost always false).

## What it does NOT do

- It does **not** run the fix. That's a separate skill that the user
  has to opt into. This skill produces a *suggestion*, the council /
  channels surface it to the user, the user decides.
- It does **not** call an LLM. Classification is regex + structured
  rules so the response is deterministic and free. The autonomous
  loop can call this skill and then layer LLM analysis on top if
  needed.

## Composition

This is the canonical "wire a sensor signal to a multi-step plan"
demo skill. The trigger pipeline is:

```
hands/sensors/terminal_error.py emits SENSOR_EVENT(terminal_error)
        ↓ websocket relay
atrium/src/synapse/client.ts receives sensor_event
        ↓ council.handleEvent
atrium/src/intelligence/council.ts matchSkills → picks this skill
        ↓ runSkill (skill-runner.ts spawns python)
skills/task-terminal-error-resolver/scripts/resolve.py
        ↓ stdout JSON
council emits action_executed with the structured suggestion
        ↓
Aegis NowPanel + channel adapters surface to user
```

If the user wants the fix applied automatically, that's a follow-up
skill (`task-terminal-error-autofix`) that takes this skill's output
as input. We do not auto-apply by default because most terminal-error
fixes are not reversible (e.g. `git reset --hard`).

## Permissions

None. This skill only reads the terminal output passed in via stdin
and returns a classification. It does not touch the filesystem,
network, or processes.
