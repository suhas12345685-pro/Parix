# Cognition (v1.3)

Parix's cognition layer turns raw sensor events into deliberate action. v1.3
introduces four cooperating systems on top of the existing event → desire →
hypothesis → action pipeline: an attention gate, a metacognitive controller,
a hierarchical planner, and a multi-session horizon. This document explains
what each module does, how they fit together, and the knobs you can turn
when the agent feels wrong.

## The loop

```
sensor event
   │
   ▼
┌──────────────┐       ┌────────────────┐
│  attention   │  no   │   (dropped)    │
│   gate()     │──────▶│  logged only   │
└──────┬───────┘       └────────────────┘
       │ admit
       ▼
 working memory ──▶ user prefs ──▶ world facts
       │
       ▼
   desire (inferredGoal, userNeed, suggestedHelp, silentPrep, interrupt)
       │
       ▼
   hypotheses (ranked explanations)
       │
       ▼
┌──────────────┐
│ metacognition│   strategy ∈ {reflex, deliberate, ask_user, defer, delegate}
│   assess()   │   timeBudgetMs, cognitiveLoad, shouldExplain
└──────┬───────┘
       │
       ▼
   planner.decompose() ──▶ GoalTree (nodes + dependsOn)
       │
       ▼
   horizon.checkCoherence() ──▶ conflicts? reinforces? prior attempts?
       │
       ▼
   simulate ──▶ critique ──▶ execute (council FSM)
       │
       ▼
   learning.learnFromOutcome() ──▶ skill cache, calibration, narrative attempts
```

Every cycle ends by feeding the outcome back into:

- **Working memory** (recent signals, blockers, uncertainty)
- **Calibration history** (was our predicted confidence right?)
- **Narrative attempts** (did this approach work for this goal?)
- **Skill cache** (can we recognize this pattern next time?)

## Modules

### Attention — `cognition/attention.ts`

A gate that decides whether an event deserves cognitive processing at all.
Without it, every keystroke and CPU sample would trigger the full pipeline.

Decision order:

1. **Breakthrough** event types (`battery_critical`, `app_crash`, …) are
   always admitted and bypass focus.
2. **Suppressed** types are dropped until their timer expires.
3. **Relevance ≥ 0.7** to the current focus → admitted, focus strengthens.
4. **Novelty ≥ 0.8** with **confidence ≥ 0.85** → admitted as new information;
   may shift focus if it beats current focus inertia.
5. **Deep focus + low relevance** (strength > 0.6 and relevance < 0.3) → rejected.
6. Otherwise: `confidence * (0.5 + 0.5 * relevance) > BASE_THRESHOLD + strength * FOCUS_WEIGHT`.

Key thresholds (see `attention.ts`):

| Constant                    | Default | Effect                                        |
| --------------------------- | ------- | --------------------------------------------- |
| `BASE_THRESHOLD`            | 0.60    | Floor for admitting an event without focus.   |
| `FOCUS_WEIGHT`              | 0.20    | How much focus strength raises the threshold. |
| `STRENGTH_GROWTH_PER_CYCLE` | 0.03    | How fast focus deepens on relevant admissions.|
| `STRENGTH_DECAY_PER_TICK`   | 0.015   | How fast focus fades while idle.              |
| `NOVELTY_WINDOW`            | 10      | Recent events compared for novelty.           |
| `MAX_SUPPRESS_DURATION_MS`  | 5 min   | Cap on `suppress()` timers.                   |

Cold-start safety: when working memory has no `recentSignals`, novelty
returns `1.0` so every first event is treated as new.

### Metacognition — `cognition/metacognition.ts`

Picks the *strategy* the rest of the pipeline should use, given the desire,
the ranked hypotheses, current working memory, and the set of active goal
trees. Output: `{ strategy, reason, timeBudgetMs, cognitiveLoad, shouldExplain }`.

Strategies, in priority order:

1. **reflex** — top confidence > 0.85, skill-cache hit, load < 0.4. Fire fast.
2. **delegate** — cache hit with moderate confidence (> 0.7) and load < 0.6.
3. **ask_user** — low confidence, irreversible action, poor recent calibration,
   load > 0.8, or an uncertain interrupt request.
4. **defer** — non-urgent but uncertain or overloaded.
5. **deliberate** — the default thoughtful path (load < 0.7, conf ≥ 0.3).
6. Fallback **ask_user** if overloaded *and* deeply uncertain.

`computeLoad(activeGoalTrees, workingMemory)` is a 0–1 score derived from
the number of active trees, pending nodes across them, blockers in working
memory, and uncertainty. On a fresh boot all four are near zero, so load
starts near zero and the loop is free to deliberate.

**Brier calibration.** Each cycle records `(predictedConfidence,
actualOutcome)` and computes a rolling Brier score over the last 100
records. If the agent has been overconfident recently
(`calibration < 0.4`), metacognition raises the bar for acting alone and
asks the user more often. `getCalibrationStats()` exposes the score plus
counts of over- and under-confident calls for the dashboard.

### Planner — `cognition/planner/`

`decompose(desire, hypotheses, worldFacts)` turns a desire into a
`GoalTree` of `PlanNode`s with `dependsOn` edges. Simple desires get a
single node; complex desires fan out into three phases:

1. **silent_prep** — gather context (no deps, runs immediately).
2. **investigate** — chase the top hypotheses' missing evidence (depends on prep).
3. **act** — the actual help, gated on investigation.

`nextExecutable(tree)` returns every node whose deps are done — the
parallelism layer. `advance(tree, nodeId, success, result, error)`
records the outcome and, on failure, hands off to:

`repairStrategy(tree, failedNode)`:

- **retry** if `retries < maxRetries` and the error matches a transient
  list (`ECONNREFUSED`, `ETIMEDOUT`, `timeout`, `rate_limit`, …).
- **skip** if the failed node has no pending dependents.
- **replan_subtree** if dependents exist and retries are exhausted —
  downstream nodes have the dead dependency removed and remember
  `_skippedPrereq` in their payload.
- **escalate** when nothing safe remains; the tree moves to `suspended`.

State persists to `plan_trees` and survives restarts via
`loadActivePlanTrees()` / `savePlanTree()`.

### Horizon — `cognition/horizon.ts`

Multi-session narrative coherence. A *narrative* is a goal the agent has
been pursuing across cycles or sessions; each attempt at it is recorded
with an outcome and optional lesson.

- `startNarrative(goal, trigger)` — reuses an existing similar narrative
  if one is still active; otherwise creates a new one.
- `recordAttempt(narrativeId, { approach, outcome, lessonLearned })`:
  - On `success`, the narrative is marked `succeeded`.
  - On three consecutive `failure` attempts the narrative is marked
    `blocked` with a reason, and the executor should escalate instead
    of trying again silently.
- `checkCoherence(proposedAction)` runs before execution and returns:
  - **conflicts** — destructive actions targeting entities the narrative
    cares about.
  - **reinforces** — actions whose goal overlaps an active narrative.
  - **suggestions** — anti-repetition warnings ("previously tried X for Y
    and it failed: <lesson>").
- `getStaleNarratives()` surfaces narratives untouched for > 24h so
  Aegis can prompt the user to abandon or revive them.

Persistence flows through `horizon-store.ts`. Loaders tolerate a brand
new DB (missing tables) without throwing.

## Tuning guide

Symptoms → which knob:

- **Agent is too noisy / interrupts too often.** Lower the desire
  `interrupt` triggers (raise the confidence/urgency floor in `desire.ts`),
  raise `BASE_THRESHOLD` in `attention.ts`, or add the noisy event type
  to a `suppress(type, ms)` call.
- **Agent is too quiet / ignores real events.** Lower `BASE_THRESHOLD`,
  reduce `FOCUS_WEIGHT` so deep focus doesn't suppress as aggressively,
  or add the missed type to `BREAKTHROUGH_EVENTS` if it should always pass.
- **Agent thrashes between topics.** Increase `FOCUS_WEIGHT` and
  `STRENGTH_GROWTH_PER_CYCLE`; this makes focus harder to dislodge.
- **Agent gets stuck in deep focus when it shouldn't.** Decrease
  `STRENGTH_GROWTH_PER_CYCLE` or increase `STRENGTH_DECAY_PER_TICK`. The
  novelty-shift path (`shouldShiftForNovelty`) is the escape hatch — make
  sure surprising events have high confidence so they break through.
- **Plans keep retrying the same broken step.** Lower `maxRetries` on the
  node (default 2) or extend the `TRANSIENT_ERRORS` list only with errors
  that are genuinely transient.
- **Plans fail and never escalate.** Check that downstream nodes still
  exist; `skip` only fires when there are no pending dependents.
- **Agent forgets it tried something already.** Confirm `recordAttempt`
  is being called from `learning.ts` with a meaningful `approach` string.
  `hasBeenTried` compares tokenized overlap > `SIMILARITY_THRESHOLD`
  (0.4) — drop it lower if matches are too strict.
- **Strategy is always `ask_user`.** Likely calibration is poor; check
  `getCalibrationStats()`. Either calibration data is too sparse (it
  defaults to 0.6 until five records are in) or the agent really has
  been wrong. Either way, raising `recordCalibration` accuracy is the fix.
- **Strategy is always `reflex`.** A skill is matching too aggressively
  in `skillcache.ts`; tighten its trigger.

## Calibration self-correction

Calibration is the feedback loop that keeps the agent honest. Every
decision that produces an observable outcome calls
`recordCalibration(predictedConfidence, actualOutcome)`. The score is
`1 - mean((predicted - actual)^2)` over the last 100 records — a perfect
forecaster scores 1.0, an always-wrong one scores 0.0.

When the score drops below 0.4, `shouldAskUser()` flips on for any
decision below 0.75 confidence. The agent gets quieter until its
predictions catch up with reality. Once enough successful outcomes land,
the score recovers and the agent regains autonomy automatically — no
manual reset required.

## Skills: manifest registry + runner

Skills are two cooperating systems:

1. **Skill cache** (`atrium/src/intelligence/skillcache.ts`) — a learned cache
   keyed on `hashPattern(eventType, data)`. Populated by `recordSkill()` after a
   successful run; `lookupSkill()` reads it.
2. **Skill registry** (`atrium/src/intelligence/skill-registry.ts`) — a
   declarative registry loaded from disk on boot. Scans `skills/task-*/config.json`,
   validates each manifest, and indexes its triggers.

Metacognition's `hasCache` flag — the one that drives the `reflex` and
`delegate` strategies — is `true` if **either** source matches. So a freshly
installed agent can take confident action via declared skills before it has
learned anything.

### Manifest shape

Every skill manifest validates against
[`shared/skill-manifest.schema.json`](../shared/skill-manifest.schema.json).
The TypeScript type lives in [`shared/types/skill.ts`](../shared/types/skill.ts).
Required fields: `id`, `version`, `enabled`, `triggers`, `entry`, `runtime`
(`py` | `node` | `sh`), `inputs`, `outputs`, `reversibility` (0–1),
`permissions[]`. Optional: `timeoutMs`, `settings`.

A trigger matches when **all** of these hold:

- `eventType` equals the event's type
- `minConfidence` (if set) ≤ event.confidence
- `platforms` (if set) includes the current OS, or contains `any`
- every `dataKeys` entry is present in `event.data`
- at least one `keywords` entry appears (case-insensitive) in the stringified
  `event.data`

Multiple skills can match the same event; the executor decides which to run
based on reversibility, cost, and prior outcomes.

### Runner

`runSkill({ skillDir, manifest, inputs, permittedPermissions })` spawns the
manifest's `entry` under `python`, `node`, or `bash`, pipes `JSON.stringify(inputs)`
to stdin, captures stdout/stderr, enforces `timeoutMs` (default 60s), and
returns a normalized `SkillResult` with `success`, `exitCode`, `durationMs`,
`output` (parsed JSON if stdout is a JSON object), and `error` (on failure or
timeout).

Pass `permittedPermissions` (a `Set<SkillPermission>`) to gate execution. If
the manifest declares a permission not in the set, the runner throws
`SkillPermissionError` before spawning anything. The constitution layer and
reversibility scorer still apply on top — the permission gate is a *necessary*
check, not a sufficient one.

### Tuning the registry

- **Skill never fires.** Confirm the trigger eventType exactly matches the
  sensor's event type. Check `minConfidence` isn't above what your sensor
  emits. Look at `[BOOT] Loaded N skill manifest(s)` — if the count is 0,
  either the folder name doesn't start with `task-` or the entry script is
  missing.
- **Skill fires on the wrong events.** Add `dataKeys` or `keywords` to the
  trigger to narrow it. Use `platforms` to scope to one OS.
- **Skill times out.** Bump `timeoutMs` in the manifest, or split the work
  across multiple invocations. The default 60s is conservative.
- **Multiple skills match and the wrong one wins.** Today the executor takes
  the first match; if you need explicit priority, encode it via reversibility
  (the council prefers reversible actions) and/or narrower triggers.

## What the agent can see — the accessibility pipeline

Cognition isn't just told "active app: VS Code." It can see the focused UI
element — its role, name, state, even bounds — through the accessibility
moat. The data flow:

```
hands/accessibility/AccessibilityBridge
       │   .snapshot(mode="auto")
       ▼
hands/sensors/a11y_poller.py
       │   fingerprint() — change-only
       │   summarize() — wire-safe (focused + 2 levels)
       ▼
synapse WebSocket: ACCESSIBILITY_SNAPSHOT
       │
       ▼
atrium/src/synapse/a11y-handler.ts
       │   persists to accessibility_snapshots
       │   exposes getLatestAccessibility()
       ▼
atrium/src/cognition/working-memory.ts
       │   reads on each cycle → WorkingMemory.focusedElement
       ▼
desire.ts + hypotheses.ts use it:
   - desire.evidence  cites focused element
   - desire.interrupt softens when typing/in-dialog
   - hypothesis confidence  boosted when its explanation overlaps focus
```

The poller debounces on a *fingerprint* of focus state (app + element role +
name + value + sorted states) — so a 1Hz tick rate produces messages only on
real focus transitions, not on every poll.

**Knobs:**
- `PARIX_A11Y_INTERVAL_S` — poll ceiling (default 1.0s, floor 0.2s).
- `PARIX_A11Y_MODE` — `auto` (default) / `accessibility` / `vision` / `fused`.
- `PARIX_A11Y_DISABLED=1` — turn the poller off entirely.

**Tuning examples:**
- "Agent breaks me out of typing too aggressively." — the typing floor in
  `desire.ts` is `confidence >= 0.85, urgency >= 0.6`. Raise either.
- "Hypothesis ranking is too sensitive to UI labels." — drop the `0.3`
  factor in the `bump = Math.min(0.15, overlap * 0.3)` line in
  `hypotheses.ts`.
- "I'd rather the agent not look at UI at all." — set
  `PARIX_A11Y_DISABLED=1` on the Hands process.

## File map

| Concern                | File                                         |
| ---------------------- | -------------------------------------------- |
| Pipeline orchestration | `atrium/src/cognition/index.ts`              |
| Attention gate         | `atrium/src/cognition/attention.ts`          |
| Strategy + calibration | `atrium/src/cognition/metacognition.ts`      |
| Hierarchical planner   | `atrium/src/cognition/planner/index.ts`      |
| Plan persistence       | `atrium/src/cognition/planner/store.ts`      |
| Narratives             | `atrium/src/cognition/horizon.ts`            |
| Narrative persistence  | `atrium/src/cognition/horizon-store.ts`      |
| Working memory         | `atrium/src/cognition/working-memory.ts`     |
| Desire inference       | `atrium/src/cognition/desire.ts`             |
| Hypothesis ranking     | `atrium/src/cognition/hypotheses.ts`         |
| Simulation + critique  | `atrium/src/cognition/simulator.ts`, `critic.ts` |
| Learning               | `atrium/src/cognition/learning.ts`           |
| Skill registry         | `atrium/src/intelligence/skill-registry.ts`  |
| Skill runner           | `atrium/src/intelligence/skill-runner.ts`    |
| Skill cache (learned)  | `atrium/src/intelligence/skillcache.ts`      |
| Manifest schema        | `shared/skill-manifest.schema.json`, `shared/types/skill.ts` |
| Accessibility bridge   | `hands/accessibility/__init__.py` and backends                |
| Accessibility poller   | `hands/sensors/a11y_poller.py`                                |
| Accessibility ingest   | `atrium/src/synapse/a11y-handler.ts`                          |
| Aegis component        | `aegis/src/components/AccessibilityFocus.tsx`                 |
| Schema                 | `shared/schema.sql` (plan_trees, narratives, calibration_records, attention_log, accessibility_snapshots) |
