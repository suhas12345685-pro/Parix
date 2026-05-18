# Codex Tasks — Cognition v1.3 Wiring

These tasks assume Claude has already written the core logic files:
- `atrium/src/cognition/planner/types.ts` (done)
- `atrium/src/cognition/planner/index.ts` (done)
- `atrium/src/cognition/attention.ts` (done)
- `atrium/src/cognition/metacognition.ts` (done)
- `atrium/src/cognition/horizon.ts` (done)

---

## Task 1: DB Schema Migration

**File:** `shared/schema.sql`  
**Action:** Append these tables after the existing `storage_sync_state` table:

```sql
-- ── Cognition v1.3: Planning ──────────────────────────────────

CREATE TABLE IF NOT EXISTS plan_trees (
  id TEXT PRIMARY KEY,
  root_goal TEXT NOT NULL,
  trigger TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  nodes_json TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_plan_trees_status ON plan_trees(status);

-- ── Cognition v1.3: Narratives (Long-Horizon) ────────────────

CREATE TABLE IF NOT EXISTS narratives (
  id TEXT PRIMARY KEY,
  goal TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  trigger TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  blocked_reason TEXT,
  attempts_json TEXT NOT NULL DEFAULT '[]',
  started_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_activity_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_narratives_status ON narratives(status);

-- ── Cognition v1.3: Metacognition Calibration ─────────────────

CREATE TABLE IF NOT EXISTS calibration_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  predicted_confidence REAL NOT NULL,
  actual_outcome INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── Cognition v1.3: Attention Log ─────────────────────────────

CREATE TABLE IF NOT EXISTS attention_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  admitted INTEGER NOT NULL,
  reason TEXT,
  focus TEXT,
  focus_strength REAL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

---

## Task 2: Planner Store

**File:** `atrium/src/cognition/planner/store.ts` (CREATE)

```typescript
import { getDb } from '../../memory/db.js';
import type { GoalTree } from './types.js';

export function savePlanTree(tree: GoalTree): void {
  getDb().run(
    `INSERT INTO plan_trees (id, root_goal, trigger, status, nodes_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status,
       nodes_json = excluded.nodes_json,
       updated_at = excluded.updated_at`,
    [
      tree.id,
      tree.rootGoal,
      tree.trigger,
      tree.status,
      JSON.stringify(tree.nodes),
      new Date(tree.createdAt).toISOString(),
      new Date(tree.updatedAt).toISOString(),
    ]
  );
}

export function loadActivePlanTrees(): GoalTree[] {
  const trees: GoalTree[] = [];
  const stmt = getDb().prepare(
    'SELECT * FROM plan_trees WHERE status IN (?, ?) ORDER BY updated_at DESC'
  );
  stmt.bind(['active', 'suspended']);
  while (stmt.step()) {
    const cols = stmt.getColumnNames();
    const vals = stmt.get();
    const row: Record<string, unknown> = {};
    cols.forEach((c: string, i: number) => (row[c] = vals[i]));

    trees.push({
      id: String(row.id),
      rootGoal: String(row.root_goal),
      trigger: String(row.trigger),
      status: row.status as GoalTree['status'],
      nodes: JSON.parse(String(row.nodes_json)),
      createdAt: new Date(String(row.created_at)).getTime(),
      updatedAt: new Date(String(row.updated_at)).getTime(),
    });
  }
  stmt.free();
  return trees;
}

export function removePlanTree(id: string): void {
  getDb().run('DELETE FROM plan_trees WHERE id = ?', [id]);
}
```

---

## Task 3: Horizon Store

**File:** `atrium/src/cognition/horizon-store.ts` (CREATE)

```typescript
import { getDb } from '../memory/db.js';
import type { Narrative } from './horizon.js';
import { serializeForDb } from './horizon.js';

export function saveNarrative(narrative: Narrative): void {
  const row = serializeForDb(narrative);
  getDb().run(
    `INSERT INTO narratives (id, goal, summary, trigger, status, blocked_reason, attempts_json, started_at, last_activity_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       summary = excluded.summary,
       status = excluded.status,
       blocked_reason = excluded.blocked_reason,
       attempts_json = excluded.attempts_json,
       last_activity_at = excluded.last_activity_at`,
    [row.id, row.goal, row.summary, row.trigger, row.status, row.blocked_reason, row.attempts_json, row.started_at, row.last_activity_at]
  );
}

export function loadNarratives(): Array<{
  id: string; goal: string; summary: string; trigger: string;
  status: string; blocked_reason: string | null;
  started_at: string; last_activity_at: string; attempts_json: string;
}> {
  const rows: any[] = [];
  const stmt = getDb().prepare(
    'SELECT * FROM narratives WHERE status IN (?, ?) ORDER BY last_activity_at DESC'
  );
  stmt.bind(['active', 'blocked']);
  while (stmt.step()) {
    const cols = stmt.getColumnNames();
    const vals = stmt.get();
    const row: Record<string, unknown> = {};
    cols.forEach((c: string, i: number) => (row[c] = vals[i]));
    rows.push(row);
  }
  stmt.free();
  return rows;
}
```

---

## Task 4: Wire Attention Gate into `runCognition()`

**File:** `atrium/src/cognition/index.ts`  
**Action:** Import attention and gate events early, skip processing if not admitted.

```diff
 import { v4 as uuid } from 'uuid';
 import type { CognitiveDecision, CognitiveEvent, CognitiveSnapshot } from './types.js';
+import { gate, setFocus, getAttentionState } from './attention.js';
 import { updateWorkingMemory } from './working-memory.js';
 ...

 export function runCognition(event: CognitiveEvent): CognitiveSnapshot | null {
+  const workingMemoryPrecheck = getWorkingMemory();
+  const verdict = gate(event, workingMemoryPrecheck);
+
+  if (!verdict.admit) {
+    return null; // Attention gate rejected this event
+  }
+
   observeWorld(event);
   observeUserPreference(event);
   ...
+  // Set focus from high-confidence desire
+  if (desire.confidence > 0.7 && desire.inferredGoal) {
+    setFocus(desire.inferredGoal);
+  }
   ...
 }
```

Also: change return type from `CognitiveSnapshot` to `CognitiveSnapshot | null`.
Update `council.ts` call to handle `null` return (skip processing if null).

---

## Task 5: Replace `selectMode()` with Metacognition

**File:** `atrium/src/cognition/index.ts`  
**Action:** Replace the current `selectMode()` call with metacognition assessment.

```diff
+import { assess as metacogAssess } from './metacognition.js';
+import { getAllActiveTrees } from './planner/index.js';
+import { lookupSkill } from '../intelligence/skillcache.js';
 ...
-  const decision: CognitiveDecision = {
-    mode: selectMode(desire.confidence, workingMemory.uncertainty, hypotheses[0]?.confidence ?? 0),
+  const hasCache = !!lookupSkill(event.type, event.data);
+  const metacog = metacogAssess(desire, hypotheses, workingMemory, getAllActiveTrees(), hasCache);
+
+  const decision: CognitiveDecision = {
+    mode: metacog.strategy === 'reflex' ? 'reflex'
+      : metacog.strategy === 'deliberate' ? 'normal'
+      : metacog.strategy === 'defer' ? 'research'
+      : 'deep',
     ...
   };
```

Remove the now-unused `selectMode()` function.

---

## Task 6: Wire Planner into Council

**File:** `atrium/src/intelligence/council.ts`  
**Action:** After `deliberate()` returns a plan, check if it should be decomposed.

```diff
+import { decompose, nextExecutable, advance, getAllActiveTrees, getProgress } from '../cognition/planner/index.js';
+import { savePlanTree } from '../cognition/planner/store.js';
 ...
 // Inside processQueue(), after deliberate() returns a plan:

+    // If cognition produced a complex desire, decompose into goal tree
+    const cogSnapshot = getLastCognitiveSnapshot();
+    if (cogSnapshot && cogSnapshot.decision.mode !== 'reflex') {
+      const tree = decompose(
+        cogSnapshot.decision.desire,
+        cogSnapshot.decision.hypotheses,
+        cogSnapshot.worldFacts
+      );
+      savePlanTree(tree);
+
+      // Execute first available node instead of the flat plan
+      const executable = nextExecutable(tree);
+      if (executable.length > 0) {
+        // Override plan with first executable node
+        plan = {
+          id: executable[0].id,
+          taskType: executable[0].taskType,
+          payload: executable[0].payload,
+          reversibilityScore: 0,
+          constitutionVerdict: { allowed: true, reason: '' },
+          reasoning: `Plan step: ${executable[0].goal}`,
+        };
+      }
+    }
```

---

## Task 7: Wire Horizon Coherence Check

**File:** `atrium/src/intelligence/council.ts`  
**Action:** Before `execute()`, check coherence.

```diff
+import { checkCoherence, startNarrative, recordAttempt, getActiveNarratives } from '../cognition/horizon.js';
+import { saveNarrative } from '../cognition/horizon-store.js';
 ...
 // Before execute():
+    const coherence = checkCoherence(
+      { id: plan.id, taskType: plan.taskType, payload: plan.payload, reason: plan.reasoning, reversibility: plan.reversibilityScore },
+      getActiveNarratives()
+    );
+
+    if (!coherence.isCoherent && plan.reversibilityScore < 0.7) {
+      console.log(`[ATRIUM] Coherence conflict: ${coherence.conflicts.join('; ')}`);
+      // Don't block, but log and maybe notify
+    }
+
+    if (coherence.suggestions.length > 0) {
+      console.log(`[ATRIUM] Horizon suggestion: ${coherence.suggestions[0]}`);
+    }
```

After `execute()` result:
```diff
+    // Record attempt in relevant narrative
+    const narrative = startNarrative(plan.reasoning, plan.taskType);
+    recordAttempt(narrative.id, {
+      approach: `${plan.taskType}: ${plan.reasoning}`,
+      outcome: result.success ? 'success' : 'failure',
+      timestamp: Date.now(),
+      lessonLearned: result.error ?? undefined,
+    });
+    saveNarrative(narrative);
```

---

## Task 8: Wire `resumeNarratives()` into Boot

**File:** `atrium/src/index.ts` (or wherever `initDb()` is called)  
**Action:** After DB init, load narratives.

```diff
+import { loadFromDb } from './cognition/horizon.js';
+import { loadNarratives } from './cognition/horizon-store.js';
+import { loadActivePlanTrees } from './cognition/planner/store.js';
 ...
 // After initDb():
+const narrativeRows = loadNarratives();
+loadFromDb(narrativeRows);
+console.log(`[BOOT] Loaded ${narrativeRows.length} active narratives`);
+
+const activePlans = loadActivePlanTrees();
+console.log(`[BOOT] Loaded ${activePlans.length} active plan trees`);
```

---

## Task 9: Wire `decayFocus()` into Heartbeat

**File:** `atrium/src/scheduler/jobs/heartbeat.ts` (or equivalent cron job)  
**Action:** Call attention decay on each heartbeat tick.

```diff
+import { decayFocus, cleanExpiredSuppressions, resetStats } from '../../cognition/attention.js';
 ...
 // Inside heartbeat handler:
+decayFocus();
+cleanExpiredSuppressions();
```

Reset stats every 100 ticks or 5 minutes for rolling metrics.

---

## Task 10: Wire Calibration into Learning

**File:** `atrium/src/cognition/learning.ts`  
**Action:** Record calibration when outcomes are known.

```diff
+import { recordCalibration } from './metacognition.js';
 ...
 export function learnFromOutcome(taskType: string, success: boolean, reason: string): void {
+  // Feed metacognition calibration
+  const lastSnapshot = getLastCognitiveSnapshot();
+  if (lastSnapshot) {
+    recordCalibration(lastSnapshot.decision.confidence, success);
+  }
+
   upsertFact({
     ...
   });
 }
```

---

## Task 11: Update `CognitiveSnapshot` type

**File:** `atrium/src/cognition/types.ts`  
**Action:** Add attention + metacognition + plan info.

```diff
+import type { AttentionState } from './attention.js';
+import type { MetacognitiveAssessment } from './metacognition.js';
+import type { PlanProgress } from './planner/types.js';

 export interface CognitiveSnapshot {
   workingMemory: WorkingMemory;
   preferences: UserPreference[];
   worldFacts: WorldFact[];
   decision: CognitiveDecision;
+  attention?: { focus: string | null; strength: number; admitRate: number };
+  metacognition?: MetacognitiveAssessment;
+  activePlan?: PlanProgress;
 }
```

---

## Task 12: Add Protocol Message Types

**File:** `shared/protocol.json`  
**Action:** Add new message types for plan lifecycle:

```json
{
  "PLAN_CREATED": { "tree_id": "string", "root_goal": "string", "node_count": "number" },
  "PLAN_STEP_STARTED": { "tree_id": "string", "node_id": "string", "goal": "string" },
  "PLAN_STEP_RESULT": { "tree_id": "string", "node_id": "string", "success": "boolean", "output": "string" },
  "PLAN_COMPLETED": { "tree_id": "string", "status": "string", "progress": "object" },
  "COHERENCE_CONFLICT": { "action_id": "string", "conflicts": "string[]", "suggestions": "string[]" },
  "FOCUS_SHIFTED": { "from": "string", "to": "string", "reason": "string" }
}
```

---

## Task 13: Test Scaffolds

Create these test files with describe/it blocks (no implementation yet):

### `atrium/src/cognition/planner/__tests__/planner.test.ts`
- `decompose()` with simple desire → single node tree
- `decompose()` with complex desire → multi-node tree with deps
- `nextExecutable()` returns only ready nodes
- `advance()` marks done correctly
- `advance()` triggers repair on failure
- `repairStrategy()` retries on transient error
- `repairStrategy()` skips non-critical with no dependents
- `repairStrategy()` escalates after max retries
- `getProgress()` calculates percentage correctly

### `atrium/src/cognition/__tests__/attention.test.ts`
- Breakthrough events always admitted
- Suppressed events always rejected
- Relevant events admitted during focus
- Irrelevant events rejected during deep focus
- Novel events break through with high confidence
- Focus decays over time
- Focus strengthens on relevant admissions

### `atrium/src/cognition/__tests__/metacognition.test.ts`
- Reflex strategy on high confidence + cache hit
- Deliberate on competing hypotheses
- Ask user on low confidence + irreversible action
- Defer on low urgency + high uncertainty
- Calibration score drops after wrong predictions
- Cognitive load increases with active plans

### `atrium/src/cognition/__tests__/horizon.test.ts`
- Start narrative creates new entry
- Start narrative returns existing if similar goal
- Record attempt with success auto-resolves
- Record attempt with 3 failures marks blocked
- checkCoherence detects destructive conflicts
- hasBeenTried finds similar past approaches
- Stale narratives detected after 24h

---

## Task 14: Aegis UI Components

### Plan Progress (`aegis/src/components/PlanProgress.tsx`)
- Show active GoalTree name + progress bar
- List nodes with status icons (pending/active/done/failed/skipped)
- Show repair actions when suspended

### Cognitive Load Meter (`aegis/src/components/CognitiveLoad.tsx`)
- Gauge visualization 0-100%
- Color: green < 40%, yellow < 70%, red >= 70%
- Tooltip with breakdown (plans, blockers, uncertainty)

### Active Narratives (`aegis/src/components/Narratives.tsx`)
- List of active narratives with goal text
- Badge for attempt count + failure streak
- "Stale" indicator if > 24h inactive
- Click to expand attempts history

### Attention Indicator (`aegis/src/components/AttentionFocus.tsx`)
- Show current focus text
- Strength bar (visual)
- Admit rate percentage
- Suppressed types count

---

## Execution Order for Codex

```
1. schema.sql additions (Task 1)
2. Store files (Tasks 2, 3) — depend on schema
3. Type updates (Task 11) — no deps
4. Protocol additions (Task 12) — no deps
5. Wiring: attention (Task 4) — depends on store
6. Wiring: metacognition (Task 5) — depends on types
7. Wiring: planner (Task 6) — depends on store + types
8. Wiring: horizon (Task 7) — depends on store
9. Boot sequence (Task 8) — depends on stores
10. Heartbeat (Task 9) — depends on attention module
11. Learning (Task 10) — depends on metacognition
12. Tests (Task 13) — depends on all wiring
13. UI (Task 14) — independent, can run in parallel with 5-12
```
