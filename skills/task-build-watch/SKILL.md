---
name: task-build-watch
description: Runs a single iteration of a build/test command and reports structured pass/fail with extracted error context. Designed to be looped by the council, not by the skill itself.
---

# Build Watch

> Use when the agent needs to repeatedly check whether a build/test
> command is still passing — e.g. while the user is editing code,
> while waiting on CI, or as a self-supervising step in a longer plan.

## Why this isn't a single long-running process

The skill-runner runs each skill as a single subprocess with a
timeout (3 minutes here). A truly long-running watcher would either
(a) keep a process alive forever, holding the runner busy, or (b)
require runtime changes to manage detached child processes. Neither
is needed.

The cleaner design: each invocation is one *iteration*. The council
re-invokes the skill on `build_watch_tick` (a timed event) or
`workspace_changed` (file-change event). The skill stays simple —
spawn, capture, classify, return — and the orchestration lives at
the council layer where it belongs.

## Composition with task-terminal-error-resolver

When the build fails, this skill emits `tail` (last ~2KB of combined
output) and `suggestedNextSkill: task-terminal-error-resolver`. The
council can chain these: run build-watch, on failure dispatch the
resolver with the captured tail as input, surface the classification
to the user.

This is the **two-skill composition** the skills landscape doc
promised — both shipped together so the chain actually works.

## What "first error line" means

The skill scans stdout+stderr for lines matching common error
signatures (`error:`, `ERROR`, `Traceback`, `FAIL`, `✗`, `npm ERR!`,
`fatal:`) and returns the *first* match. This is a fast triage hint
for the user — for full classification, feed `tail` into the
resolver.

## Permissions

- `process:execute` — required to spawn the build command.
- `filesystem:read` — required to read `cwd` if it isn't the default.

Notably **no** `filesystem:write` or `network:*`. The skill never
modifies anything or makes network calls; it just observes a
subprocess.
