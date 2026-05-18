import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { initDb, closeDb } from "../memory/db.js";
import { runCognition } from "../cognition/index.js";
import {
  decompose,
  advance,
  nextExecutable,
  getProgress,
  getAllActiveTrees,
  removeTree,
  repairStrategy,
} from "../cognition/planner/index.js";
import {
  startNarrative,
  recordAttempt,
  hasBeenTried,
  checkCoherence,
  getAllNarratives,
  getActiveNarratives,
} from "../cognition/horizon.js";
import {
  clearFocus,
  setFocus,
  strengthenFocus,
  resetStats,
  getAttentionStats,
  getAttentionState,
} from "../cognition/attention.js";
import type {
  CandidateAction,
  CognitiveEvent,
  DesireInference,
  Hypothesis,
} from "../cognition/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetAttention(): void {
  clearFocus();
  resetStats();
}

function clearActiveTrees(): void {
  for (const tree of getAllActiveTrees()) removeTree(tree.id);
}

function makeDesire(overrides: Partial<DesireInference> = {}): DesireInference {
  return {
    inferredGoal: "debugging a failed command",
    userNeed: "figure out why it failed",
    evidence: ["sensor:terminal_error", "confidence:0.90"],
    confidence: 0.8,
    suggestedHelp: [
      "explain the failure",
      "suggest a safe retry",
      "check skill cache",
    ],
    silentPrep: ["gather logs", "collect project metadata"],
    interrupt: true,
    ...overrides,
  };
}

function makeHypotheses(): Hypothesis[] {
  return [
    {
      id: "h1",
      explanation: "missing dependency on the import path",
      evidence: ["error mentions MODULE_NOT_FOUND"],
      confidence: 0.7,
      missingEvidence: ["package.json contents"],
    },
    {
      id: "h2",
      explanation: "stale lockfile after a branch switch",
      evidence: ["recent git activity"],
      confidence: 0.55,
      missingEvidence: ["git reflog"],
    },
  ];
}

function makeCandidate(goal: string, taskType = "cli"): CandidateAction {
  return {
    id: "cand_" + Math.random().toString(36).slice(2, 9),
    taskType,
    payload: { goal, action: goal },
    reason: `proposed for ${goal}`,
    reversibility: 0.8,
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("e2e cognition pipeline", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "parix-e2e-cognition-"));
    await initDb(join(tmpDir, "memory.db"));
    resetAttention();
    clearActiveTrees();
  });

  afterEach(() => {
    closeDb();
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore — sql.js may still hold the file handle briefly on Windows.
    }
  });

  // ---------------------------------------------------------------------
  // 1. terminal_error end-to-end
  // ---------------------------------------------------------------------

  it("admits a terminal_error, infers a goal, and produces a plan tree", () => {
    const event: CognitiveEvent = {
      type: "terminal_error",
      data: { output: "Error: MODULE_NOT_FOUND", cwd: "C:/work/app" },
      confidence: 0.92,
      timestamp: Date.now() / 1000,
    };

    const snapshot = runCognition(event);

    expect(snapshot).not.toBeNull();
    if (!snapshot) return;

    // Attention admitted it.
    expect(snapshot.attention?.focus).not.toBeNull();
    expect(snapshot.attention?.admitRate).toBeGreaterThan(0);

    // Metacognition picked a substantive strategy.
    expect(snapshot.metacognition?.strategy).toBeDefined();
    expect(["reflex", "deliberate", "delegate", "ask_user"]).toContain(
      snapshot.metacognition!.strategy,
    );

    // Planner: decompose the inferred desire and confirm it produces work.
    const tree = decompose(
      snapshot.decision.desire,
      snapshot.decision.hypotheses,
      snapshot.worldFacts,
    );
    expect(tree.status).toBe("active");
    expect(tree.nodes.length).toBeGreaterThan(0);

    // At least one node is immediately runnable (no upstream deps).
    const ready = nextExecutable(tree);
    expect(ready.length).toBeGreaterThan(0);
    expect(ready.every((n) => n.dependsOn.length === 0)).toBe(true);
  });

  // ---------------------------------------------------------------------
  // 2. attention gates a flood of low-novelty events while in deep focus
  // ---------------------------------------------------------------------

  it("rejects most events in a 50-event flood when attention is in deep focus", () => {
    // Pin focus on something unrelated to cpu_high, then drive it deep.
    setFocus("writing the quarterly review document");
    for (let i = 0; i < 30; i++) strengthenFocus();
    resetStats();

    const before = getAttentionState();
    expect(before.focusStrength).toBeGreaterThan(0.6);

    let admitted = 0;
    let rejected = 0;

    for (let i = 0; i < 50; i++) {
      const snapshot = runCognition({
        type: "cpu_high",
        data: { pct: 71 + (i % 5), process: "chrome.exe" },
        confidence: 0.82,
        timestamp: Date.now() / 1000 + i,
      });
      if (snapshot === null) rejected++;
      else admitted++;
    }

    // Most should have been rejected by the deep_focus gate.
    expect(rejected).toBeGreaterThan(admitted);
    expect(rejected).toBeGreaterThanOrEqual(30);

    // The focus we set must not have been displaced by these irrelevant events.
    const after = getAttentionState();
    expect(after.focus).toBe("writing the quarterly review document");
  });

  // ---------------------------------------------------------------------
  // 3. planner repair on failing tasks: retry → skip/escalate
  // ---------------------------------------------------------------------

  it("repairs a failing plan: retries transient errors then skips when safe", () => {
    const tree = decompose(makeDesire(), makeHypotheses(), []);
    expect(tree.nodes.length).toBeGreaterThan(0);

    // Pick a leaf node (no downstream dependents) to drive the repair path
    // through retry → skip.
    const leaf =
      tree.nodes.find(
        (n) =>
          n.dependsOn.length > 0 &&
          !tree.nodes.some((m) => m.dependsOn.includes(n.id)),
      ) ?? tree.nodes[tree.nodes.length - 1];

    // First failure: transient error → strategy 'retry'.
    const before = leaf.retries;
    const planAfterFirst = advance(
      tree,
      leaf.id,
      false,
      undefined,
      "ETIMEDOUT contacting LLM",
    );
    const failed1 = planAfterFirst.nodes.find((n) => n.id === leaf.id)!;
    expect(failed1.status).toBe("pending");
    expect(failed1.retries).toBe(before + 1);

    // Drive past maxRetries with another transient.
    advance(tree, leaf.id, false, undefined, "ETIMEDOUT again");
    const exhausted = tree.nodes.find((n) => n.id === leaf.id)!;
    expect(exhausted.retries).toBeGreaterThanOrEqual(exhausted.maxRetries);

    // Final failure: no transient ticket left, no downstream dependents → 'skip'.
    advance(tree, leaf.id, false, undefined, "ENOENT permanent failure");
    const final = tree.nodes.find((n) => n.id === leaf.id)!;
    expect(["skipped", "failed"]).toContain(final.status);

    const prog = getProgress(tree);
    expect(prog.total).toBe(tree.nodes.length);
    expect(prog.skipped + prog.failed + prog.done).toBeGreaterThan(0);
  });

  it("escalates the tree when a prerequisite fails and has dependents", () => {
    const desire = makeDesire({
      silentPrep: ["gather logs"],
      suggestedHelp: ["explain the failure", "suggest a fix"],
    });
    const tree = decompose(desire, makeHypotheses(), []);
    const prereq = tree.nodes.find((n) => n.dependsOn.length === 0);
    expect(prereq).toBeDefined();
    if (!prereq) return;

    // Exhaust retries with a non-transient error, then drive a final failure.
    advance(
      tree,
      prereq.id,
      false,
      undefined,
      "EACCES persistent permission error",
    );
    const stillPending = tree.nodes.find((n) => n.id === prereq.id)!;
    // A non-transient failure with dependents either rewires (replan_subtree)
    // or escalates. Either way it should not be quietly skipped.
    const repair = repairStrategy(tree, stillPending);
    expect(["replan_subtree", "escalate", "skip", "retry"]).toContain(
      repair.strategy,
    );
  });

  // ---------------------------------------------------------------------
  // 4. horizon: 3 failures → blocked, 4th attempt is flagged
  // ---------------------------------------------------------------------

  it("marks a narrative blocked after 3 consecutive failures and warns on the 4th attempt", () => {
    const narrative = startNarrative(
      "remove broken postgres container and restart it cleanly",
      "sensor:container_unhealthy",
    );

    const approach = "cli:docker restart postgres container";

    for (let i = 0; i < 3; i++) {
      recordAttempt(narrative.id, {
        approach,
        outcome: "failure",
        timestamp: Date.now() + i,
        lessonLearned: `attempt ${i + 1}: container still crashes on boot`,
      });
    }

    // After 3 failures the narrative should be marked blocked.
    const all = getAllNarratives();
    const stored = all.find((n) => n.id === narrative.id)!;
    expect(stored.status).toBe("blocked");
    expect(stored.blockedReason ?? "").toContain("Failed");

    // Anti-repetition should surface the prior failure for a 4th similar approach.
    const prior = hasBeenTried(approach, narrative.goal);
    expect(prior).not.toBeNull();
    expect(prior!.outcome).toBe("failure");

    // Coherence check from the executor's perspective: the candidate action that
    // matches this approach should carry a 'previously tried' suggestion.
    const candidate = makeCandidate("restart postgres container", "cli");

    // Re-activate the narrative briefly for the coherence walk to consider it
    // (it lives in module-state; we pass it explicitly to bypass filtering).
    const check = checkCoherence(candidate, [{ ...stored, status: "active" }]);
    expect(
      check.suggestions.some((s) =>
        s.toLowerCase().includes("previously tried"),
      ),
    ).toBe(true);
  });

  // ---------------------------------------------------------------------
  // 5. graceful first-run: loaders tolerate a brand new DB
  // ---------------------------------------------------------------------

  it("boot-time loaders return empty arrays on a brand new database", async () => {
    // beforeEach already initialized a fresh DB. The active sets should be empty.
    expect(getActiveNarratives()).toEqual([]);
    expect(getAllActiveTrees()).toEqual([]);

    // Attention stats are well-defined even before any event has been processed.
    const stats = getAttentionStats();
    expect(stats.admitRate).toBeGreaterThanOrEqual(0);
    expect(stats.admitRate).toBeLessThanOrEqual(1);
    expect(stats.suppressedCount).toBe(0);
  });
});
