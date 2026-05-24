---
name: task-complex-agent
description: Delegate a complex, multi-step real-time task to a local CLI coding agent (codex / claude / gemini) that can read files, run commands, and edit code autonomously.
---

# Complex Task Agent

Parix orchestrates; a full CLI coding agent executes. When a goal needs real
agentic work — investigate a repo, fix failing tests, refactor across files,
run a multi-step build/debug loop — the council routes it here instead of
trying to do everything with single tool calls.

## How it works

1. The council emits a `complex_task_request` (or `delegate_to_agent`) event
   with a high-level `goal`.
2. This skill picks an installed agent CLI (`claude` / `codex` / `gemini`),
   feeds the goal over **stdin** (never argv/shell — no injection), and runs it
   `shell=False`.
3. Output is ANSI-stripped and returned as structured JSON.

## Inputs

- `goal` (required): the task, e.g. `"fix the failing tests in ./"`.
- `provider` (optional): `claude` | `openai` | `gemini`. Auto-detected to the
  first installed CLI if omitted.
- `cwd` (optional): working directory.
- `timeoutSeconds` (optional, default 600): hard cap.

## Safety

The delegated CLI can modify files and run commands, so this skill is declared
`reversibility: 0.4` with `filesystem:write` + `process:execute` permissions.
The council's constitution and autonomy thresholds gate it before invocation —
it is not a free pass around the safety layer.

## Pairs with

- `task-build-watch` → detect a failing build, then delegate the fix here.
- The provider runtime mode (api vs cli) is chosen during onboarding and stored
  in `~/.parix/config.json` under `modelProviders`.
