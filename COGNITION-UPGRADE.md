# Cognition Upgrade — v1.3: Planning, Attention, Metacognition, Coherence

## Split: Claude (Opus) vs Codex

**Claude writes**: All core logic files — algorithms, state machines, scoring functions, 
decision trees. These require deep understanding of the cognitive architecture and 
careful design of thresholds/interactions.

**Codex writes**: DB schema migrations, type exports, wiring into council.ts, 
test scaffolding, Aegis UI components, protocol additions, store/persistence 
helpers, re-exports from index files.

---

## System 1: Hierarchical Planner (`atrium/src/cognition/planner/`)

### What it does
Breaks multi-step goals into dependency-aware subtask trees. Tracks execution 
progress. Repairs plans when steps fail instead of restarting from scratch.

### New types (`planner/types.ts`) — CLAUDE

```typescript
export type PlanNodeStatus = 'pending' | 'active' | 'done' | 'failed' | 'skipped';

export interface PlanNode {
  id: string;
  parentId: string | null;
  goal: string;                    // what this step achieves
  taskType: string;                // 'cli' | 'notification' | 'llm_query' | 'compound'
  payload: Record<string, unknown>;
  dependsOn: string[];             // ids that must complete before this starts
  status: PlanNodeStatus;
  result?: string;
  error?: string;
  retries: number;
  maxRetries: number;
  createdAt: number;
  updatedAt: number;
}

export interface GoalTree {
  id: string;
  rootGoal: string;
  trigger: string;                 // what event/desire spawned this plan
  nodes: PlanNode[];
  status: 'active' | 'completed' | 'failed' | 'suspended';
  createdAt: number;
  updatedAt: number;
}

export interface PlanRepairStrategy {
  failedNodeId: string;
  strategy: 'retry' | 'skip' | 'replan_subtree' | 'escalate';
  reason: string;
  newNodes?: PlanNode[];           // replacement subtree for 'replan_subtree'
}
```

### Core logic (`planner/index.ts`) — CLAUDE

```
decompose(desire, hypotheses, worldFacts) → GoalTree
  - Takes the cognitive pipeline output
  - For simple desires (single-action, high confidence) → flat tree with 1 node
  - For complex desires → LLM-assisted decomposition into subtasks
  - Wires dependsOn edges based on causal ordering
  - Returns GoalTree ready for execution

nextExecutable(tree) → PlanNode[]
  - Returns all nodes whose dependsOn are all 'done' and own status is 'pending'
  - This is the parallelism layer — multiple independent steps can run at once

advance(tree, nodeId, result) → GoalTree
  - Marks node as done/failed
  - If failed → calls repairStrategy()
  - If all nodes done → marks tree completed
  - Returns updated tree

repairStrategy(tree, failedNode) → PlanRepairStrategy
  - retry: if retries < maxRetries and error is transient
  - skip: if node has no dependents and is non-critical
  - replan_subtree: if node has dependents, ask LLM for alternative path
  - escalate: if destructive or unknown failure, ask user

getProgress(tree) → { total, done, failed, active, percent }
```

### What Codex does for System 1:
1. Create `planner/types.ts` with the types above
2. Create `planner/store.ts` — persist GoalTree to new `plan_trees` and `plan_nodes` DB tables
3. Add schema to `shared/schema.sql`:
   ```sql
   CREATE TABLE IF NOT EXISTS plan_trees (
     id TEXT PRIMARY KEY,
     root_goal TEXT NOT NULL,
     trigger TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'active',
     nodes_json TEXT NOT NULL,
     created_at TEXT DEFAULT CURRENT_TIMESTAMP,
     updated_at TEXT DEFAULT CURRENT_TIMESTAMP
   );
   ```
4. Create `planner/index.ts` stub that exports the function signatures
5. Wire into `council.ts`: after `deliberate()` returns a plan, check if it should 
   be decomposed via `planner.decompose()` instead of executed directly
6. Add `PLAN_STEP_RESULT` message type to `shared/protocol.json`
7. Create `planner/__tests__/planner.test.ts` scaffold with test cases:
   - Single-step plan passes through unchanged
   - Multi-step plan decomposes correctly
   - Failed step triggers repair
   - Plan completion rolls up correctly

---

## System 2: Attention Gate (`atrium/src/cognition/attention.ts`) — CLAUDE

### What it does
Decides which incoming events deserve cognitive processing given the agent's 
current focus. Prevents thrashing on noisy signals while ensuring critical 
events always break through.

### Core logic — CLAUDE writes entire file

```typescript
export interface AttentionState {
  focus: string | null;           // current primary goal/activity
  focusStrength: number;          // 0-1, how deeply engaged (increases over time)
  focusStartedAt: number;
  suppressedTypes: Set<string>;   // event types actively being ignored
  breakthrough: string[];         // event types that ALWAYS get through
}

export interface AttentionVerdict {
  admit: boolean;                 // should this event enter the cognitive pipeline?
  reason: string;
  adjustedConfidence: number;     // may boost/attenuate based on relevance to focus
  shouldShiftFocus: boolean;      // event is important enough to change what we're doing
}

// Core function: should this event get cognitive processing?
export function gate(
  event: CognitiveEvent, 
  state: AttentionState, 
  workingMemory: WorkingMemory
): AttentionVerdict

// Focus management
export function setFocus(goal: string): void
export function decayFocus(): void           // called on tick, strength drops if idle
export function clearFocus(): void

// Internals:
// - relevanceToFocus(event, focus) → 0-1 score
// - breakthroughCheck(event) → boolean (battery_critical, app_crash always pass)
// - focusInertia(strength, timeInFocus) → threshold for shifting
// - noveltyBoost(event, recentSignals) → bonus for genuinely new information
```

### Scoring logic (the hard part):

```
admit decision:
  IF event.type in breakthrough → admit=true, shouldShiftFocus=maybe
  IF relevance >= 0.7 → admit=true (supports current focus)
  IF novelty >= 0.8 AND confidence >= 0.85 → admit=true (genuinely new + certain)
  IF focusStrength > 0.6 AND relevance < 0.3 → admit=false (deep focus, irrelevant)
  ELSE → admit = (adjustedConfidence > threshold)

threshold = baseLine + (focusStrength * 0.2)
  - Higher focus = harder to interrupt
  - baseLine starts at 0.6, calibrates from feedback

adjustedConfidence = event.confidence * (0.5 + 0.5 * relevance)
  - Relevant events get confidence boost
  - Irrelevant events get attenuated
```

### What Codex does for System 2:
1. Add `attention` field to `WorkingMemory` interface in `cognition/types.ts`
2. Wire `gate()` call into `runCognition()` — early return if `admit=false`
3. Wire `setFocus()` call when desire inference produces high-confidence goal
4. Wire `decayFocus()` into the scheduler heartbeat job
5. Add attention state to `CognitiveSnapshot` for Aegis UI display
6. Create test scaffold `cognition/__tests__/attention.test.ts`

---

## System 3: Metacognition (`atrium/src/cognition/metacognition.ts`) — CLAUDE

### What it does
Thinks about thinking. Decides HOW to process a situation: fast reflex, 
slow deliberation, ask the user, or defer. Tracks calibration of its own 
confidence over time.

### Core logic — CLAUDE writes entire file

```typescript
export interface MetacognitiveAssessment {
  strategy: 'reflex' | 'deliberate' | 'ask_user' | 'defer' | 'delegate';
  reason: string;
  confidenceInStrategy: number;   // how sure we are this is the right approach
  cognitiveLoad: number;          // 0-1 how overloaded the system is
  timebudgetMs: number;           // how long we're willing to spend thinking
  shouldExplain: boolean;         // should we tell the user what we're doing?
}

export interface CalibrationRecord {
  predictedConfidence: number;
  actualOutcome: boolean;
  timestamp: number;
}

// Main entry: given the situation, how should we think?
export function assess(
  desire: DesireInference,
  hypotheses: Hypothesis[],
  workingMemory: WorkingMemory,
  activeGoalTrees: GoalTree[]
): MetacognitiveAssessment

// Calibration: are we accurate about our own confidence?
export function recordCalibration(predicted: number, actual: boolean): void
export function getCalibrationScore(): number  // 0=terrible, 1=perfectly calibrated

// Cognitive load tracking
export function computeLoad(
  activeGoalTrees: GoalTree[],
  pendingEvents: number,
  recentErrorRate: number
): number
```

### Strategy selection logic:

```
reflex: 
  - Top hypothesis confidence > 0.85 
  - Skill cache hit exists
  - cognitiveLoad < 0.4
  - Similar episode had good outcome

deliberate:
  - Multiple competing hypotheses (spread < 0.2 between top two)
  - No cache hit
  - cognitiveLoad < 0.7
  - Time budget allows (>2s)

ask_user:
  - confidence < 0.45 on all hypotheses
  - OR action is irreversible (reversibility < 0.5)
  - OR calibration score < 0.4 (we've been wrong a lot)
  - OR cognitiveLoad > 0.8 (overwhelmed, need help)

defer:
  - Low urgency + high uncertainty
  - cognitiveLoad > 0.7
  - No clear hypothesis
  - "Wait for more evidence" is acceptable

delegate:
  - Sub-problem matches a known skill exactly
  - Can hand off without full deliberation
```

### Calibration tracking:

```
Brier score over last 100 predictions:
  score = 1 - mean((predicted - actual)^2)
  
If score < 0.5 → agent is overconfident, increase ask_user threshold
If score > 0.8 → agent is well-calibrated, allow more autonomy
```

### What Codex does for System 3:
1. Add `calibration_records` table to `shared/schema.sql`
2. Create `metacognition/store.ts` for calibration persistence
3. Wire `assess()` into `runCognition()` — replace the current `selectMode()` with metacognitive strategy
4. Wire `computeLoad()` into the dashboard stats endpoint
5. Wire `recordCalibration()` into `learnFromOutcome()` 
6. Expose cognitiveLoad in Aegis dashboard (StatCard component)
7. Create test scaffold `cognition/__tests__/metacognition.test.ts`

---

## System 4: Long-Horizon Coherence (`atrium/src/cognition/horizon.ts`) — CLAUDE

### What it does
Maintains narrative continuity across cognitive cycles, sessions, and restarts.
Tracks multi-session goals, remembers what was tried, and prevents the agent 
from repeating failed approaches.

### Core logic — CLAUDE writes entire file

```typescript
export interface Narrative {
  id: string;
  goal: string;
  summary: string;                 // human-readable "story so far"
  startedAt: number;
  lastActivityAt: number;
  attempts: NarrativeAttempt[];    // what we've tried
  status: 'active' | 'succeeded' | 'abandoned' | 'blocked';
  blockedReason?: string;
}

export interface NarrativeAttempt {
  approach: string;
  outcome: 'success' | 'failure' | 'partial' | 'abandoned';
  timestamp: number;
  lessonLearned?: string;
}

export interface CoherenceCheck {
  isCoherent: boolean;             // does current action align with active narratives?
  activeNarratives: Narrative[];
  conflicts: string[];             // "you're about to delete X but narrative Y depends on it"
  suggestions: string[];           // "you tried this before and it failed because..."
}

// Lifecycle
export function startNarrative(goal: string, trigger: string): Narrative
export function recordAttempt(narrativeId: string, attempt: NarrativeAttempt): void
export function resolveNarrative(narrativeId: string, status: Narrative['status']): void

// Coherence checking — call before executing any plan
export function checkCoherence(
  proposedAction: CandidateAction,
  activeNarratives: Narrative[]
): CoherenceCheck

// Recall
export function getActiveNarratives(): Narrative[]
export function findRelevantNarrative(goal: string): Narrative | null

// Session continuity — called on startup
export function resumeNarratives(): Narrative[]  // reload from DB, surface unfinished work

// Anti-repetition — "we tried this before"
export function hasBeenTried(approach: string, goal: string): NarrativeAttempt | null
```

### Coherence logic:

```
On every plan execution:
  1. Find narratives relevant to this action (fuzzy match on goal + entities)
  2. Check for conflicts:
     - "This action undoes progress on narrative X"
     - "This approach was tried and failed in narrative Y"
  3. Check for reinforcement:
     - "This advances narrative X, step 3 of 5"
  4. Return suggestions from past attempts

On startup (resumeNarratives):
  1. Load all narratives with status='active' from DB
  2. For each, check lastActivityAt — if stale (>24h), prompt user
  3. Surface as "Unfinished work" in Aegis dashboard

Anti-repetition:
  - Hash the approach string
  - Search narrative attempts for similar hashes
  - If found with outcome='failure', return the lesson learned
  - Caller (metacognition) decides whether to proceed anyway
```

### What Codex does for System 4:
1. Add `narratives` and `narrative_attempts` tables to `shared/schema.sql`:
   ```sql
   CREATE TABLE IF NOT EXISTS narratives (
     id TEXT PRIMARY KEY,
     goal TEXT NOT NULL,
     summary TEXT NOT NULL DEFAULT '',
     trigger TEXT,
     status TEXT NOT NULL DEFAULT 'active',
     blocked_reason TEXT,
     started_at TEXT DEFAULT CURRENT_TIMESTAMP,
     last_activity_at TEXT DEFAULT CURRENT_TIMESTAMP
   );

   CREATE TABLE IF NOT EXISTS narrative_attempts (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     narrative_id TEXT NOT NULL REFERENCES narratives(id),
     approach TEXT NOT NULL,
     outcome TEXT NOT NULL,
     lesson_learned TEXT,
     created_at TEXT DEFAULT CURRENT_TIMESTAMP
   );
   ```
2. Create `horizon/store.ts` — CRUD for narratives table
3. Wire `resumeNarratives()` into atrium boot sequence (after `initDb()`)
4. Wire `checkCoherence()` into council.ts before `execute()`
5. Wire `startNarrative()` when planner creates a new GoalTree
6. Add "Active Narratives" panel to Aegis dashboard
7. Create test scaffold `cognition/__tests__/horizon.test.ts`

---

## Integration Order

```
Phase 1 — Foundations (parallel, no dependencies)
  [Claude] Write attention.ts         ← standalone, no deps
  [Claude] Write metacognition.ts     ← standalone, no deps  
  [Codex]  DB schema migrations       ← all 3 new tables
  [Codex]  All type files             ← planner/types.ts
  [Codex]  All store files            ← planner/store.ts, horizon/store.ts, metacog/store.ts

Phase 2 — Core Systems (sequential)
  [Claude] Write planner/index.ts     ← needs types from Phase 1
  [Claude] Write horizon.ts           ← needs types from Phase 1
  [Codex]  Test scaffolds for all 4   ← needs function signatures

Phase 3 — Wiring (sequential, depends on Phase 2)
  [Codex]  Wire attention gate into runCognition()
  [Codex]  Replace selectMode() with metacognition.assess()
  [Codex]  Wire planner.decompose() into council deliberate()
  [Codex]  Wire horizon.checkCoherence() before council execute()
  [Codex]  Wire resumeNarratives() into boot sequence
  [Codex]  Add protocol message types

Phase 4 — UI & Polish (parallel)
  [Codex]  Aegis: Plan progress component
  [Codex]  Aegis: Cognitive load meter
  [Codex]  Aegis: Active narratives panel
  [Codex]  Aegis: Attention state indicator
```

---

## How the upgraded cognitive loop flows

```
Event arrives
  │
  ▼
┌─────────────────┐
│  Attention Gate  │──── admit=false ──→ (discard, log)
└────────┬────────┘
         │ admit=true
         ▼
┌─────────────────┐
│ Working Memory   │──→ update signals, goal, blockers
└────────┬────────┘
         ▼
┌─────────────────┐
│ Desire Inference │──→ what does the user need?
└────────┬────────┘
         ▼
┌─────────────────┐
│  Hypotheses      │──→ possible explanations
└────────┬────────┘
         ▼
┌──────────────────┐
│  Metacognition   │──→ HOW should we think about this?
├──────────────────┤
│ reflex → skip to action
│ deliberate → full planning pipeline
│ ask_user → interrupt with question
│ defer → wait for more evidence
│ delegate → hand to skill
└────────┬─────────┘
         │ (if deliberate)
         ▼
┌──────────────────┐
│  Planner         │──→ decompose into GoalTree
│  (hierarchical)  │    wire dependencies
└────────┬─────────┘
         ▼
┌──────────────────┐
│  Horizon Check   │──→ conflicts with active narratives?
│  (coherence)     │    been tried before?
└────────┬─────────┘
         ▼
┌──────────────────┐
│  Simulate +      │──→ predict outcomes
│  Critique        │    validate safety
└────────┬─────────┘
         ▼
┌──────────────────┐
│  Execute         │──→ nextExecutable() from plan
│  (council FSM)   │    advance() on result
│                  │    repair on failure
└────────┬─────────┘
         ▼
┌──────────────────┐
│  Learn           │──→ calibrate confidence
│                  │    record narrative attempt
│                  │    update episodic memory
└──────────────────┘
```
