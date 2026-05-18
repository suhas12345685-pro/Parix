import { describe, expect, it } from "vitest";
import {
  assess,
  computeLoad,
  getCalibrationScore,
  recordCalibration,
} from "../metacognition.js";
import type { DesireInference, Hypothesis, WorkingMemory } from "../types.js";
import type { GoalTree, PlanNode } from "../planner/types.js";

describe("metacognition", () => {
  it("chooses reflex on high confidence plus cache hit", () => {
    const assessment = assess(
      makeDesire(),
      [makeHypothesis({ confidence: 0.91 })],
      makeMemory({ uncertainty: 0.1 }),
      [],
      true,
    );

    expect(assessment).toMatchObject({
      strategy: "reflex",
      shouldExplain: false,
      timeBudgetMs: 500,
    });
    expect(assessment.cognitiveLoad).toBeLessThan(0.4);
  });

  it("chooses deliberate on competing hypotheses", () => {
    const assessment = assess(
      makeDesire({ inferredGoal: "debug an intermittent auth failure" }),
      [
        makeHypothesis({ confidence: 0.66, explanation: "expired token" }),
        makeHypothesis({ confidence: 0.59, explanation: "bad redirect URI" }),
      ],
      makeMemory({ uncertainty: 0.25 }),
      [],
      false,
    );

    expect(assessment.strategy).toBe("deliberate");
    expect(assessment.reason).toContain("Multiple hypotheses");
    expect(assessment.timeBudgetMs).toBe(5000);
  });

  it("asks the user on low confidence and irreversible action", () => {
    const assessment = assess(
      makeDesire({
        inferredGoal: "delete production database backup",
        confidence: 0.42,
      }),
      [makeHypothesis({ confidence: 0.38 })],
      makeMemory({ uncertainty: 0.55 }),
      [],
      false,
    );

    expect(assessment.strategy).toBe("ask_user");
    expect(assessment.shouldExplain).toBe(true);
    expect(assessment.reason).toContain("low confidence");
    expect(assessment.reason).toContain("irreversible action");
  });

  it("defers on low urgency and high uncertainty", () => {
    const assessment = assess(
      makeDesire({
        inferredGoal: "keep watching a noisy metric",
        confidence: 0.48,
        interrupt: false,
      }),
      [makeHypothesis({ confidence: 0.46 })],
      makeMemory({ uncertainty: 0.86 }),
      [],
      false,
    );

    expect(assessment.strategy).toBe("defer");
    expect(assessment.timeBudgetMs).toBe(0);
    expect(assessment.reason).toContain("waiting for more evidence");
  });

  it("calibration score drops after wrong predictions", () => {
    const before = getCalibrationScore();

    for (let i = 0; i < 5; i++) {
      recordCalibration(0.99, false);
    }

    expect(getCalibrationScore()).toBeLessThan(before);

    for (let i = 0; i < 120; i++) {
      recordCalibration(0.99, true);
    }
  });

  it("cognitive load increases with active plans", () => {
    const memory = makeMemory({ uncertainty: 0.2, blockers: [] });
    const emptyLoad = computeLoad([], memory);
    const loaded = computeLoad(
      [
        makeTree([
          makeNode({ id: "pending-1" }),
          makeNode({ id: "pending-2" }),
          makeNode({ id: "active-1", status: "active" }),
        ]),
        makeTree([makeNode({ id: "pending-3" })]),
      ],
      makeMemory({
        uncertainty: 0.4,
        blockers: ["recent error", "network instability"],
      }),
    );

    expect(emptyLoad).toBeCloseTo(0.02);
    expect(loaded).toBeGreaterThan(emptyLoad);
    expect(loaded).toBeGreaterThanOrEqual(0.4);
  });
});

function makeDesire(overrides: Partial<DesireInference> = {}): DesireInference {
  return {
    inferredGoal: "debug a failed command",
    userNeed: "understand the failure and continue safely",
    evidence: ["sensor:terminal_error"],
    confidence: 0.8,
    suggestedHelp: ["explain the likely root cause"],
    silentPrep: [],
    interrupt: true,
    ...overrides,
  };
}

function makeHypothesis(overrides: Partial<Hypothesis> = {}): Hypothesis {
  return {
    id: "h-" + Math.random().toString(36).slice(2, 8),
    explanation: "missing dependency",
    evidence: ["terminal output"],
    confidence: 0.7,
    missingEvidence: [],
    ...overrides,
  };
}

function makeMemory(overrides: Partial<WorkingMemory> = {}): WorkingMemory {
  return {
    currentGoal: null,
    activeApp: null,
    activeProject: null,
    recentSignals: [],
    blockers: [],
    assumptions: [],
    uncertainty: 0.5,
    focusedElement: null,
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeTree(nodes: PlanNode[]): GoalTree {
  return {
    id: "tree-" + Math.random().toString(36).slice(2, 8),
    rootGoal: "unit test tree",
    trigger: "unit-test",
    nodes,
    status: "active",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function makeNode(overrides: Partial<PlanNode> = {}): PlanNode {
  const id = overrides.id ?? "node-" + Math.random().toString(36).slice(2, 8);
  return {
    id,
    parentId: null,
    goal: `goal for ${id}`,
    taskType: "cli",
    payload: {},
    dependsOn: [],
    status: "pending",
    retries: 0,
    maxRetries: 2,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}
