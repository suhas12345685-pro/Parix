import { v4 as uuid } from "uuid";
import type { DesireInference, Hypothesis, WorldFact } from "../types.js";
import type {
  GoalTree,
  PlanNode,
  PlanProgress,
  PlanRepairStrategy,
} from "./types.js";

const TRANSIENT_ERRORS = [
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ECONNRESET",
  "EPIPE",
  "timeout",
  "rate_limit",
  "service_unavailable",
];

const activeTrees = new Map<string, GoalTree>();

// ---------------------------------------------------------------------------
// Decomposition — turn a desire into an executable goal tree
// ---------------------------------------------------------------------------

export function decompose(
  desire: DesireInference,
  hypotheses: Hypothesis[],
  worldFacts: WorldFact[],
): GoalTree {
  const treeId = uuid();
  const now = Date.now();

  const nodes = isComplex(desire, hypotheses)
    ? decomposeComplex(desire, hypotheses, worldFacts, treeId)
    : decomposeSingle(desire, hypotheses);

  const tree: GoalTree = {
    id: treeId,
    rootGoal: desire.inferredGoal,
    trigger:
      desire.evidence.find((e) => e.startsWith("sensor:"))?.slice(7) ??
      "unknown",
    nodes,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };

  activeTrees.set(tree.id, tree);
  return tree;
}

function isComplex(desire: DesireInference, hypotheses: Hypothesis[]): boolean {
  if (desire.suggestedHelp.length > 2) return true;
  if (desire.silentPrep.length > 0 && desire.suggestedHelp.length > 0)
    return true;

  const topTwo = hypotheses.slice(0, 2);
  if (
    topTwo.length === 2 &&
    Math.abs(topTwo[0].confidence - topTwo[1].confidence) < 0.15
  ) {
    return true;
  }

  return false;
}

function decomposeSingle(
  desire: DesireInference,
  hypotheses: Hypothesis[],
): PlanNode[] {
  const now = Date.now();
  const top = hypotheses[0];

  return [
    {
      id: uuid(),
      parentId: null,
      goal: desire.inferredGoal,
      taskType: inferTaskType(desire),
      payload: {
        goal: desire.inferredGoal,
        need: desire.userNeed,
        hypothesis: top?.explanation ?? desire.inferredGoal,
        help: desire.suggestedHelp,
      },
      dependsOn: [],
      status: "pending",
      retries: 0,
      maxRetries: 2,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function decomposeComplex(
  desire: DesireInference,
  hypotheses: Hypothesis[],
  worldFacts: WorldFact[],
  _treeId: string,
): PlanNode[] {
  const now = Date.now();
  const nodes: PlanNode[] = [];

  // Phase 1: Silent preparation (no deps, can run immediately)
  const prepIds: string[] = [];
  for (const prep of desire.silentPrep) {
    const id = uuid();
    prepIds.push(id);
    nodes.push({
      id,
      parentId: null,
      goal: prep,
      taskType: "silent_prep",
      payload: {
        action: prep,
        worldFacts: worldFacts.slice(0, 5).map((f) => `${f.key}=${f.value}`),
      },
      dependsOn: [],
      status: "pending",
      retries: 0,
      maxRetries: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Phase 2: Investigate top hypotheses (depends on prep)
  const investigateIds: string[] = [];
  const topHypotheses = hypotheses.slice(0, 3);

  for (const hyp of topHypotheses) {
    if (hyp.missingEvidence.length === 0) continue;

    const id = uuid();
    investigateIds.push(id);
    nodes.push({
      id,
      parentId: null,
      goal: `Gather evidence for: ${hyp.explanation}`,
      taskType: "investigate",
      payload: {
        hypothesis: hyp.explanation,
        missingEvidence: hyp.missingEvidence,
        confidence: hyp.confidence,
      },
      dependsOn: [...prepIds],
      status: "pending",
      retries: 0,
      maxRetries: 2,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Phase 3: Act on best hypothesis (depends on investigation)
  const actionDeps = investigateIds.length > 0 ? investigateIds : prepIds;
  for (const help of desire.suggestedHelp.slice(0, 3)) {
    const id = uuid();
    nodes.push({
      id,
      parentId: null,
      goal: help,
      taskType: inferActionTaskType(desire),
      payload: {
        action: help,
        goal: desire.inferredGoal,
        need: desire.userNeed,
      },
      dependsOn: [...actionDeps],
      status: "pending",
      retries: 0,
      maxRetries: 2,
      createdAt: now,
      updatedAt: now,
    });
  }

  // If no nodes were generated, fall back to single
  if (nodes.length === 0) {
    return decomposeSingle(desire, hypotheses);
  }

  return nodes;
}

function inferTaskType(desire: DesireInference): string {
  if (desire.interrupt) return "notification";
  if (desire.silentPrep.length > 0) return "silent_prep";
  return "cli";
}

function inferActionTaskType(desire: DesireInference): string {
  return desire.interrupt ? "notification" : "cli";
}

// ---------------------------------------------------------------------------
// Execution — find next runnable nodes, advance on results
// ---------------------------------------------------------------------------

export function nextExecutable(tree: GoalTree): PlanNode[] {
  if (tree.status !== "active") return [];

  const doneIds = new Set(
    tree.nodes
      .filter((n) => n.status === "done" || n.status === "skipped")
      .map((n) => n.id),
  );

  return tree.nodes.filter((node) => {
    if (node.status !== "pending") return false;
    return node.dependsOn.every((depId) => doneIds.has(depId));
  });
}

export function advance(
  tree: GoalTree,
  nodeId: string,
  success: boolean,
  result?: string,
  error?: string,
): GoalTree {
  const now = Date.now();
  const node = tree.nodes.find((n) => n.id === nodeId);
  if (!node) return tree;

  if (success) {
    node.status = "done";
    node.result = result;
  } else {
    node.error = error;

    const repair = repairStrategy(tree, node);
    applyRepair(tree, node, repair);
  }

  node.updatedAt = now;
  tree.updatedAt = now;

  // Check if tree is complete
  const allTerminal = tree.nodes.every(
    (n) =>
      n.status === "done" || n.status === "failed" || n.status === "skipped",
  );

  if (allTerminal) {
    const anyFailed = tree.nodes.some((n) => n.status === "failed");
    tree.status = anyFailed ? "failed" : "completed";
  }

  activeTrees.set(tree.id, tree);
  return tree;
}

// ---------------------------------------------------------------------------
// Plan repair — decide what to do when a step fails
// ---------------------------------------------------------------------------

export function repairStrategy(
  tree: GoalTree,
  failedNode: PlanNode,
): PlanRepairStrategy {
  const errorStr = failedNode.error ?? "";

  // Retry on transient errors
  if (failedNode.retries < failedNode.maxRetries) {
    const isTransient = TRANSIENT_ERRORS.some((e) => errorStr.includes(e));
    if (isTransient) {
      return {
        failedNodeId: failedNode.id,
        strategy: "retry",
        reason: `Transient error (${errorStr.slice(0, 60)}), attempt ${failedNode.retries + 1}/${failedNode.maxRetries}`,
      };
    }
  }

  // Skip if non-critical (no downstream dependents)
  const hasDependents = tree.nodes.some(
    (n) => n.dependsOn.includes(failedNode.id) && n.status === "pending",
  );

  if (!hasDependents) {
    return {
      failedNodeId: failedNode.id,
      strategy: "skip",
      reason: `No downstream dependents, safe to skip: ${failedNode.goal}`,
    };
  }

  // If downstream dependents exist but error is not transient, try replan
  if (failedNode.retries >= failedNode.maxRetries && hasDependents) {
    const dependents = tree.nodes.filter(
      (n) => n.dependsOn.includes(failedNode.id) && n.status === "pending",
    );

    // Replan: remove dependency on failed node for downstream tasks
    // so they can attempt without the failed prerequisite
    const rewiredNodes = dependents.map((dep) => ({
      ...dep,
      dependsOn: dep.dependsOn.filter((id) => id !== failedNode.id),
      payload: {
        ...dep.payload,
        _skippedPrereq: failedNode.goal,
        _skippedError: errorStr.slice(0, 200),
      },
    }));

    return {
      failedNodeId: failedNode.id,
      strategy: "replan_subtree",
      reason: `Prerequisite "${failedNode.goal}" failed after ${failedNode.retries} retries, rewiring ${dependents.length} dependent(s) to proceed without it`,
      newNodes: rewiredNodes,
    };
  }

  // Escalate: can't recover automatically
  return {
    failedNodeId: failedNode.id,
    strategy: "escalate",
    reason: `Cannot recover from failure in "${failedNode.goal}": ${errorStr.slice(0, 100)}`,
  };
}

function applyRepair(
  tree: GoalTree,
  node: PlanNode,
  repair: PlanRepairStrategy,
): void {
  switch (repair.strategy) {
    case "retry":
      node.retries++;
      node.status = "pending";
      node.error = undefined;
      break;

    case "skip":
      node.status = "skipped";
      break;

    case "replan_subtree":
      node.status = "failed";
      if (repair.newNodes) {
        for (const rewired of repair.newNodes) {
          const existing = tree.nodes.find((n) => n.id === rewired.id);
          if (existing) {
            existing.dependsOn = rewired.dependsOn;
            existing.payload = rewired.payload;
          }
        }
      }
      break;

    case "escalate":
      node.status = "failed";
      tree.status = "suspended";
      break;
  }
}

// ---------------------------------------------------------------------------
// Progress tracking
// ---------------------------------------------------------------------------

export function getProgress(tree: GoalTree): PlanProgress {
  const total = tree.nodes.length;
  const done = tree.nodes.filter((n) => n.status === "done").length;
  const failed = tree.nodes.filter((n) => n.status === "failed").length;
  const active = tree.nodes.filter((n) => n.status === "active").length;
  const skipped = tree.nodes.filter((n) => n.status === "skipped").length;

  return {
    total,
    done,
    failed,
    active,
    skipped,
    percent: total === 0 ? 0 : Math.round(((done + skipped) / total) * 100),
  };
}

// ---------------------------------------------------------------------------
// Tree management
// ---------------------------------------------------------------------------

export function getActiveTree(id: string): GoalTree | undefined {
  return activeTrees.get(id);
}

export function getAllActiveTrees(): GoalTree[] {
  return [...activeTrees.values()].filter(
    (t) => t.status === "active" || t.status === "suspended",
  );
}

export function loadTrees(trees: GoalTree[]): void {
  for (const tree of trees) {
    activeTrees.set(tree.id, tree);
  }
}

export function removeTree(id: string): void {
  activeTrees.delete(id);
}

export type {
  GoalTree,
  PlanNode,
  PlanProgress,
  PlanRepairStrategy,
} from "./types.js";
