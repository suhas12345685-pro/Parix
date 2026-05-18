import { afterEach, describe, expect, it } from "vitest";
import {
  advance,
  decompose,
  getAllActiveTrees,
  getProgress,
  nextExecutable,
  removeTree,
  repairStrategy,
} from "../index.js";
import type { DesireInference, Hypothesis, WorldFact } from "../../types.js";
import type { GoalTree, PlanNode } from "../types.js";

describe("planner", () => {
  afterEach(() => {
    for (const tree of getAllActiveTrees()) {
      removeTree(tree.id);
    }
  });

  it("decompose() with simple desire creates a single node tree", () => {
    const tree = decompose(
      makeDesire({
        inferredGoal: "explain a failed install command",
        suggestedHelp: ["explain the likely cause"],
        silentPrep: [],
        interrupt: false,
      }),
      [makeHypothesis({ confidence: 0.82, missingEvidence: [] })],
      [],
    );

    expect(tree.status).toBe("active");
    expect(tree.rootGoal).toBe("explain a failed install command");
    expect(tree.trigger).toBe("terminal_error");
    expect(tree.nodes).toHaveLength(1);
    expect(tree.nodes[0]).toMatchObject({
      parentId: null,
      goal: "explain a failed install command",
      taskType: "cli",
      dependsOn: [],
      status: "pending",
      retries: 0,
      maxRetries: 2,
    });
  });

  it("decompose() with complex desire creates prep, investigation, and action nodes", () => {
    const tree = decompose(
      makeDesire({
        inferredGoal: "debug a module resolution failure",
        suggestedHelp: ["explain root cause", "prepare safe retry"],
        silentPrep: ["collect package metadata"],
        interrupt: false,
      }),
      [
        makeHypothesis({
          explanation: "missing dependency",
          confidence: 0.7,
          missingEvidence: ["package.json"],
        }),
        makeHypothesis({
          explanation: "stale lockfile",
          confidence: 0.62,
          missingEvidence: ["package-lock.json"],
        }),
      ],
      [makeWorldFact()],
    );

    const prep = tree.nodes.filter((node) => node.taskType === "silent_prep");
    const investigations = tree.nodes.filter(
      (node) => node.taskType === "investigate",
    );
    const actions = tree.nodes.filter((node) => node.taskType === "cli");

    expect(prep).toHaveLength(1);
    expect(investigations).toHaveLength(2);
    expect(actions).toHaveLength(2);
    expect(
      investigations.every((node) => node.dependsOn.includes(prep[0].id)),
    ).toBe(true);
    expect(
      actions.every((node) =>
        investigations.every((investigation) =>
          node.dependsOn.includes(investigation.id),
        ),
      ),
    ).toBe(true);
  });

  it("nextExecutable() returns only ready nodes", () => {
    const tree = makeTree([
      makeNode({ id: "setup", status: "done" }),
      makeNode({ id: "ready-a", dependsOn: ["setup"] }),
      makeNode({ id: "ready-b", dependsOn: ["setup"] }),
      makeNode({ id: "blocked", dependsOn: ["missing"] }),
      makeNode({ id: "already-active", status: "active" }),
    ]);

    expect(
      nextExecutable(tree)
        .map((node) => node.id)
        .sort(),
    ).toEqual(["ready-a", "ready-b"]);
  });

  it("advance() marks a successful node done and rolls the tree up", () => {
    const tree = makeTree([makeNode({ id: "only-step" })]);
    const advanced = advance(tree, "only-step", true, "completed");

    expect(advanced.nodes[0]).toMatchObject({
      status: "done",
      result: "completed",
    });
    expect(advanced.status).toBe("completed");
  });

  it("advance() retries a transient failure through repair", () => {
    const tree = makeTree([makeNode({ id: "flaky", maxRetries: 2 })]);
    const advanced = advance(
      tree,
      "flaky",
      false,
      undefined,
      "ETIMEDOUT while contacting model",
    );

    expect(advanced.nodes[0]).toMatchObject({
      status: "pending",
      retries: 1,
      error: undefined,
    });
    expect(advanced.status).toBe("active");
  });

  it("repairStrategy() retries transient errors", () => {
    const node = makeNode({
      id: "flaky",
      error: "ECONNRESET from upstream",
      retries: 0,
      maxRetries: 2,
    });
    const tree = makeTree([node]);

    expect(repairStrategy(tree, node)).toMatchObject({
      failedNodeId: "flaky",
      strategy: "retry",
    });
  });

  it("repairStrategy() skips non-critical nodes with no dependents", () => {
    const node = makeNode({
      id: "optional",
      error: "ENOENT optional note missing",
      retries: 2,
      maxRetries: 2,
    });
    const tree = makeTree([node]);

    expect(repairStrategy(tree, node)).toMatchObject({
      failedNodeId: "optional",
      strategy: "skip",
    });
  });

  it("repairStrategy() replans dependent work after retries are exhausted", () => {
    const failed = makeNode({
      id: "prereq",
      error: "EACCES persistent permission error",
      retries: 2,
      maxRetries: 2,
    });
    const dependent = makeNode({ id: "dependent", dependsOn: ["prereq"] });
    const tree = makeTree([failed, dependent]);

    const repair = repairStrategy(tree, failed);

    expect(repair.strategy).toBe("replan_subtree");
    expect(repair.newNodes?.[0]).toMatchObject({
      id: "dependent",
      dependsOn: [],
    });
    expect(repair.newNodes?.[0].payload).toMatchObject({
      _skippedPrereq: failed.goal,
    });
  });

  it("repairStrategy() escalates unrecoverable prerequisites", () => {
    const failed = makeNode({
      id: "prereq",
      error: "EACCES persistent permission error",
      retries: 0,
      maxRetries: 2,
    });
    const dependent = makeNode({ id: "dependent", dependsOn: ["prereq"] });
    const tree = makeTree([failed, dependent]);

    expect(repairStrategy(tree, failed)).toMatchObject({
      failedNodeId: "prereq",
      strategy: "escalate",
    });
  });

  it("getProgress() calculates percentage correctly", () => {
    const tree = makeTree([
      makeNode({ id: "done", status: "done" }),
      makeNode({ id: "skipped", status: "skipped" }),
      makeNode({ id: "failed", status: "failed" }),
      makeNode({ id: "pending", status: "pending" }),
    ]);

    expect(getProgress(tree)).toEqual({
      total: 4,
      done: 1,
      skipped: 1,
      failed: 1,
      active: 0,
      percent: 50,
    });
  });
});

function makeDesire(overrides: Partial<DesireInference> = {}): DesireInference {
  return {
    inferredGoal: "debug a failed command",
    userNeed: "understand and safely fix the failure",
    evidence: ["sensor:terminal_error", "confidence:0.90"],
    confidence: 0.82,
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
    evidence: ["error mentions missing module"],
    confidence: 0.7,
    missingEvidence: [],
    ...overrides,
  };
}

function makeWorldFact(): WorldFact {
  return {
    key: "active_project",
    value: "C:/work/app",
    confidence: 0.8,
    evidence: ["cwd"],
  };
}

function makeTree(
  nodes: PlanNode[],
  overrides: Partial<GoalTree> = {},
): GoalTree {
  return {
    id: "tree-" + Math.random().toString(36).slice(2, 8),
    rootGoal: "test goal",
    trigger: "unit-test",
    nodes,
    status: "active",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeNode(overrides: Partial<PlanNode> = {}): PlanNode {
  const id = overrides.id ?? "node-" + Math.random().toString(36).slice(2, 8);
  return {
    id,
    parentId: null,
    goal: `goal for ${id}`,
    taskType: "cli",
    payload: { goal: `goal for ${id}` },
    dependsOn: [],
    status: "pending",
    retries: 0,
    maxRetries: 2,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}
