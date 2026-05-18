# Agent Prompts — Cognition v1.3 Completion

## Prompt for Claude (Opus 4.7) — Logic, Integration, E2E

```
You are working on Parix, a local-first agentic AI agent at C:\Users\DELL\parix.

## Context

4 new cognition modules were just written and wired in:
- `atrium/src/cognition/planner/index.ts` — Hierarchical goal tree decomposition + plan repair
- `atrium/src/cognition/attention.ts` — Focus-aware event gating
- `atrium/src/cognition/metacognition.ts` — Strategy selection (reflex/deliberate/ask_user/defer/delegate) + Brier calibration
- `atrium/src/cognition/horizon.ts` — Multi-session narrative coherence + anti-repetition

Codex has completed:
- DB schema (plan_trees, narratives, calibration_records, attention_log tables in shared/schema.sql)
- Store files (planner/store.ts, horizon-store.ts)
- Wiring into council.ts, runCognition(), learning.ts, heartbeat
- Type updates to CognitiveSnapshot
- Protocol message additions
- Test scaffolds (describe/it blocks, no assertions yet)

## Your Job

### 1. Verify TypeScript compiles cleanly
Run `npm run build` in atrium/. Fix all type errors. Common issues will be:
- Circular imports between cognition modules
- `runCognition()` return type changed to `CognitiveSnapshot | null` — all callers in council.ts must handle null
- `getWorkingMemory()` needs to be exported from working-memory.ts for attention.ts to call pre-check
- `lookupSkill` import in cognition/index.ts (it's in intelligence/skillcache.ts)

### 2. Write E2E integration tests (real logic, not mocks)
Create `atrium/src/__tests__/e2e-cognition.test.ts`:
- Boot the full pipeline (initDb with :memory:, create AtriumEngine)
- Inject a `terminal_error` event → assert: attention admits it, metacognition picks 'deliberate' or 'reflex', planner decomposes, council executes
- Inject 50 rapid `cpu_high` events → assert: attention rejects most (deep focus), only first few get through
- Inject a failing task result → assert: planner repair retries then skips/escalates
- Start a narrative, fail 3 times → assert: horizon marks it 'blocked', anti-repetition warns on 4th attempt

### 3. Fix edge cases
- `attention.ts`: if `getWorkingMemory()` is called before any event, recentSignals is empty — noveltyScore should return 1.0 (everything is novel on cold start)
- `metacognition.ts`: `computeLoad()` receives GoalTree[] from `getAllActiveTrees()` — on fresh boot this is empty, load should be near 0
- `planner/index.ts`: if `desire.suggestedHelp` is empty AND `desire.silentPrep` is empty, `decomposeComplex` falls through to `decomposeSingle` — verify this path works
- `horizon.ts`: `loadFromDb()` is called on boot — if DB has no narratives table yet (first run), catch gracefully

### 4. Write cognition documentation
Create `docs/cognition.md` explaining:
- The upgraded cognitive loop (event → attention → working memory → desire → metacognition → planner → horizon → simulate → execute → learn)
- Each module's role and key thresholds
- How to tune: what to change if the agent is too aggressive (lower BASE_THRESHOLD in attention), too passive (raise it), thrashing (increase FOCUS_WEIGHT), etc.
- How calibration self-corrects over time

### 5. Write release notes
Create `CHANGELOG.md` entry for v0.1.3-alpha:
- What shipped (4 systems)
- Breaking changes (runCognition now returns null if attention rejects)
- Migration notes (new DB tables auto-created on boot)

## Key Files to Reference
- Architecture: COGNITION-UPGRADE.md
- Codex task list: CODEX-TASKS.md
- Existing cognitive pipeline: atrium/src/cognition/index.ts
- Council FSM: atrium/src/intelligence/council.ts
- DB layer: atrium/src/memory/db.ts
- Schema: shared/schema.sql
```

---

## Prompt for Codex — Mechanical Tasks, Tests, UI, CI

```
You are working on Parix at C:\Users\DELL\parix. The cognition v1.3 upgrade logic is complete. Your job is mechanical wiring, tests, UI, and CI.

## Already Done (don't redo)
- Core logic: planner/index.ts, attention.ts, metacognition.ts, horizon.ts
- DB schema additions in shared/schema.sql
- Store files: planner/store.ts, horizon-store.ts
- Wiring into council.ts, runCognition, learning.ts

## Your Remaining Tasks

### 1. Fill in test assertions
Files exist with describe/it blocks but no assertions:
- `atrium/src/cognition/planner/__tests__/planner.test.ts`
- `atrium/src/cognition/__tests__/attention.test.ts`
- `atrium/src/cognition/__tests__/metacognition.test.ts`
- `atrium/src/cognition/__tests__/horizon.test.ts`

For each test:
- Import the module under test
- Create minimal test fixtures (fake events, desires, hypotheses)
- Assert the documented behavior (see COGNITION-UPGRADE.md for expected behavior)
- Use vitest (already configured in atrium/vitest.config.ts)

### 2. Aegis UI Components
Create 4 new React components in `aegis/src/components/`:

**PlanProgress.tsx** — Shows active GoalTree progress
- Import type GoalTree from shared types
- Render: tree name, progress bar (done/total), node list with status badges
- Wire to WebSocket data from atrium relay

**CognitiveLoad.tsx** — Gauge showing system load
- Render: circular gauge 0-100%, color-coded (green/yellow/red at 40/70 thresholds)
- Props: { load: number, breakdown: { plans, blockers, uncertainty } }

**Narratives.tsx** — Active narratives list
- Render: list of active narratives with goal, attempt count, stale badge (>24h)
- Expandable: show attempts history on click

**AttentionFocus.tsx** — Current focus state
- Render: focus text, strength bar, admit rate %, suppressed count

Add all 4 to the Dashboard page layout.

### 3. GitHub Actions CI
Create `.github/workflows/ci.yml`:
```yaml
name: CI
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run build --workspace=shared
      - run: npm run build --workspace=atrium
      - run: npm run build --workspace=aegis
      - run: npm test --workspace=atrium
```

### 4. Documentation (mechanical parts)
- `docs/architecture.md` — Copy the diagram from COGNITION-UPGRADE.md, add descriptions of each layer
- `.env.example` — List all LLM API key env vars (ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, GROQ_API_KEY, etc.)
- `CONTRIBUTING.md` — Standard open-source template (fork, branch, PR, test requirements)
- Update `README.md` — Add "Cognition" section with the flow diagram, link to docs/

### 5. Lint + Format
- Run `npx eslint --fix` across all new files in atrium/src/cognition/
- Run `npx prettier --write` across atrium/ and shared/
- Fix any remaining lint errors (unused vars, missing types)

## Key References
- COGNITION-UPGRADE.md — full architecture + flow diagram
- CODEX-TASKS.md — detailed specs for each task
- Existing UI pattern: aegis/src/components/StatCard.tsx, aegis/src/pages/Dashboard.tsx
- Test pattern: look at any existing .test.ts files in atrium/src/
```
