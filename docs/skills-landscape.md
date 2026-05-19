# Skills landscape — what exists, what's wired, what's next

Last updated: 2026-05-19. Captures the actual state of skills in the
repo before adding more. Read this before proposing new skills so
they land in the right place.

## Three kinds of "skill" live side-by-side

Parix uses the word "skill" for three different things. They're all
legitimate, but they're not interchangeable.

### 1. Knowledge skills — `skills/parix-*` and `skills/os-*`

Folders like [skills/parix-cognition](../skills/parix-cognition) and
[skills/os-windows](../skills/os-windows). Each has a `SKILL.md` with
YAML frontmatter and prose documentation.

**Purpose:** context bundles for Claude / the agent runtime. They
document architecture, OS behavior, and operational runbooks. They are
not executable on their own.

**How they're loaded:** [skills/registry.json](../skills/registry.json)
has a `loadOrder` listing every knowledge skill. The atrium runtime
does not invoke these via the `skill-runner` — they're context for the
agent's reasoning, not action.

**When to add one:** when a body of knowledge (an OS quirk, a Parix
subsystem, a third-party API's gotchas) is large enough to deserve
its own bundle, and the agent will need to recall it when reasoning.

### 2. Executable trigger-based skills — `skills/task-*`

Folders like [skills/task-disk-cleanup](../skills/task-disk-cleanup).
Each has `config.json` (machine-readable manifest with triggers,
permissions, entry script) **and** `SKILL.md` (human-readable
description).

**Purpose:** actions the council can execute in response to events.
The `config.json` declares `triggers[]` that match sensor event types
(e.g. `eventType: "disk_low"`, `minConfidence: 0.7`), and the council
fires the matching skill's `entry` script when a sensor event clears
the bar.

**How they're loaded:**
[atrium/src/intelligence/skill-registry.ts](../atrium/src/intelligence/skill-registry.ts)
scans `skills/` for dirs prefixed `task-`, parses each `config.json`,
and indexes them by `eventType`. The council uses
`matchSkills(event)` at runtime to pick candidates.

**Permission posture:** each `task-*` skill ID also appears in
[atrium/src/intelligence/skill-permissions.ts](../atrium/src/intelligence/skill-permissions.ts)
with an explicit grant set. Unknown skills get an empty grant (no
filesystem, network, process, clipboard, or browser powers). This is
the floor that backs the won't-fix-by-design disposition on
[Finding 2](./security-audit-v0.2.md) — the agent's trust boundary
sits at the policy/approval layer, and this allowlist is the
fallback for skills nobody has explicitly approved.

**When to add one:** when there's a concrete sensor signal (terminal
error, disk low, app crash, focus change) that should reliably trigger
a programmed response. This is the **proactive skill** layer.

### 3. Anthropic-style capability primitives — `.agents/skills/*`

Folders like [.agents/skills/accessibility-reader](../.agents/skills/accessibility-reader).
Anthropic skill convention: `SKILL.md` with YAML frontmatter, optional
`scripts/`, `references/`, `templates/`.

**Purpose:** building-block capabilities (read the a11y tree, run a
shell command, take a screenshot, talk via STT/TTS) that higher-level
flows compose. Each one is a thin, well-scoped action surface.

**How they're loaded:** referenced by
[atrium/src/aegis/relay.ts](../atrium/src/aegis/relay.ts) as
`AGENT_SKILLS_DIR = .agents/skills`. They're surfaced to whatever
client convention reads from `.agents/skills/` — they are NOT loaded
into the atrium `skill-registry` (the registry only reads `task-*`
prefixed dirs).

**When to add one:** when you need a new low-level capability that
isn't already covered by the existing nine
(accessibility-reader, cli-executor, computer-use, os-sensors,
platform-detect, safe-browsing, screen-capture, system-health,
voice-agent). These are the alphabet, not the words.

## What's missing: proactive responder skills

The current set is heavy on **building blocks** and light on
**responders** that wire a sensor signal to a multi-step plan.

The 11 `task-*` skills already lean proactive — they're triggered by
events like `disk_low`, `network_error`, `process_zombie`. But each
one is a single action against a single sensor signal. They don't
compose.

The autonomous creative agent loop (PR #2) and the goal-tree planner
do compose skills — but only when invoked with a user-level goal,
not from a sensor signal alone.

**The gap:** there is no skill that says *"when this signal fires,
plan a multi-step response and execute it."* That's the proactive
responder layer. Some candidates worth a first pass:

| Skill ID | Trigger | Composes | Why this one is high-value |
|---|---|---|---|
| `task-terminal-error-resolver` | `os-sensors:terminal_error` | `cli-executor` → search-docs → `cli-executor` retry | Demo of the moat: agent reads terminal output and proactively offers a fix. Visible win every dev sees daily. |
| `task-focus-context` | `accessibility:focus_change` | `accessibility-reader` → memory recall → narrative summary | Lets the agent quietly prepare context for whatever the user just focused on. The accessibility moat made visible. |
| `task-build-watch` | User-invoked, then long-running | `cli-executor` (npm run build) → `os-sensors` → channel notify | Proves long-running autonomous skill works end-to-end with channels. |
| `task-clipboard-secret-redactor` | `os-sensors:clipboard_secret` | redact → notify | Privacy story made concrete. Fires when the OS sensor detects a key/token on the clipboard. |
| `task-meeting-prep` | `calendar:upcoming_event` (new sensor) | memory recall → channel digest | Showcases proactiveness — fires N minutes before a meeting, prepares context. Needs a calendar sensor first. |

## The infrastructure under each skill type

```
                        ┌─────────────────────────────────┐
                        │  shared/skill-manifest.schema.json
                        │  shared/types/skill.ts           │
                        │     (manifest contract)          │
                        └─────────────────────────────────┘
                          │
       ┌──────────────────┼──────────────────────────────┐
       │                  │                              │
       ▼                  ▼                              ▼
  knowledge skill   task-* skill                  .agents/skills/*
  (SKILL.md only)   (config.json + SKILL.md)      (Anthropic SKILL.md)
       │                  │                              │
       │                  ▼                              │
       │            skill-registry.ts                    │
       │            (event→skill index)                  │
       │                  │                              │
       │                  ▼                              │
       │            council picks skill                  │
       │                  │                              │
       │                  ▼                              │
       │            skill-runner.ts spawns               │
       │            (timeout, stdin JSON,                │
       │             permission gate)                    │
       │                                                 │
       ▼                                                 ▼
  registry.json loadOrder                       aegis/relay.ts AGENT_SKILLS_DIR
  (agent reasoning context)                     (client-side surface)
```

## What this doc does not decide

- Whether `.agents/skills/*` and `skills/task-*` should be unified. They
  serve different roles today; merging them would be a separate
  design pass with real cost.
- Whether `task-meeting-prep` (or any skill needing a new sensor)
  should land before the sensor it depends on. Probably not — write
  the sensor first.
- Whether the skill-runner should support skill-calling-skill at the
  runtime level. Probably not — the council/planner is the right layer
  for composition. The runner stays a single-process executor.

## Pre-flight before adding a new skill

Read in order:
1. Pick a type (knowledge / task / capability) from the table above.
2. Look at one existing example of that type. Copy its shape.
3. If it's a `task-*` skill: add the ID + permission grants to
   `skill-permissions.ts` in the same change. The skill cannot do
   anything without grants.
4. If it has triggers: verify the `eventType` is actually emitted by
   one of the sensors (`hands/sensors/*`). If not, add the sensor
   first or pick a different trigger.
5. Run `npm test --workspace=atrium`. The skill-registry tests will
   catch a malformed `config.json`. The permission tests will catch
   missing grants for known IDs.
