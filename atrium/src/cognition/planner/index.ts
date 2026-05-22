import { v4 as uuid } from "uuid";
import type { DesireInference, Hypothesis, WorldFact } from "../types.js";
import type {
  GoalTree,
  PlanNode,
  PlanNodeExecutor,
  PlanReflectionKind,
  PlanProgress,
  PlanRepairStrategy,
  PlanRevision,
  ReflectionPatch,
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
const DEFAULT_MAX_CONCURRENCY = 4;

const SCHEMA_DRIFT_PATTERNS = [
  "schema drift",
  "unknown field",
  "unexpected field",
  "contract changed",
  "api changed",
  "invalid enum",
];

const ENVIRONMENT_SHIFT_PATTERNS = [
  "environment changed",
  "path changed",
  "working directory changed",
  "capability unavailable",
  "capability missing",
];

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
    graphVersion: "dag-v2",
    maxConcurrency: DEFAULT_MAX_CONCURRENCY,
    revisions: [
      {
        id: uuid(),
        ts: now,
        kind: "decomposition",
        reason: "Initial desire decomposition",
        affectedNodeIds: nodes.map((node) => node.id),
        injectedNodeIds: nodes.map((node) => node.id),
      },
    ],
    runtime: {
      activeNodeIds: [],
      completedNodeIds: [],
      failedNodeIds: [],
      blockedNodeIds: [],
      maxConcurrency: DEFAULT_MAX_CONCURRENCY,
    },
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
      injectedBy: "decomposition",
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
      priority: 20,
      injectedBy: "decomposition",
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
      priority: 40,
      injectedBy: "decomposition",
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
      priority: 60,
      injectedBy: "decomposition",
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

  const activeCount = tree.nodes.filter((node) => node.status === "active")
    .length;
  const maxConcurrency = tree.runtime?.maxConcurrency ?? tree.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
  const availableSlots = Math.max(0, maxConcurrency - activeCount);

  return tree.nodes
    .filter((node) => {
      if (node.status !== "pending") return false;
      return node.dependsOn.every((depId) => doneIds.has(depId));
    })
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    .slice(0, availableSlots);
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
  refreshRuntimeState(tree);
  tree.updatedAt = now;

  // Check if tree is complete
  const allTerminal = tree.nodes.every(
    (n) =>
      n.status === "done" ||
      n.status === "failed" ||
      n.status === "skipped" ||
      n.status === "blocked",
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
  const failureKind = classifyFailure(errorStr);

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

  const dependents = tree.nodes.filter(
    (n) => n.dependsOn.includes(failedNode.id) && n.status === "pending",
  );
  const hasDependents = dependents.length > 0;

  if (hasDependents && (failureKind === "schema_drift" || failureKind === "environment_shift")) {
    const alternative = buildAlternativeNode(tree, failedNode, failureKind, errorStr);
    return {
      failedNodeId: failedNode.id,
      strategy: "inject_alternative",
      reason: `${failureKind} detected in "${failedNode.goal}", injecting alternate path and rewiring ${dependents.length} dependent(s)`,
      newNodes: [alternative],
      rewire: dependents.map((dep) => ({
        nodeId: dep.id,
        removeDeps: [failedNode.id],
        addDeps: [alternative.id],
      })),
    };
  }

  // Skip if non-critical (no downstream dependents)
  if (!hasDependents) {
    return {
      failedNodeId: failedNode.id,
      strategy: "skip",
      reason: `No downstream dependents, safe to skip: ${failedNode.goal}`,
    };
  }

  // If downstream dependents exist but error is not transient, try replan
  if (failedNode.retries >= failedNode.maxRetries && hasDependents) {
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
      appendRevision(tree, "replan_subtree", repair.reason, [node.id], []);
      break;

    case "inject_alternative": {
      node.status = "failed";
      const injectedIds: string[] = [];
      for (const newNode of repair.newNodes ?? []) {
        tree.nodes.push(newNode);
        injectedIds.push(newNode.id);
      }
      applyRewire(tree, repair.rewire ?? []);
      appendRevision(tree, "inject_alternative", repair.reason, [node.id], injectedIds);
      break;
    }

    case "sandbox":
      node.status = "blocked";
      appendRevision(tree, "sandbox", repair.reason, [node.id], []);
      break;

    case "escalate":
      node.status = "failed";
      blockDownstream(tree, node.id, repair.reason);
      appendRevision(tree, "escalate", repair.reason, [node.id], []);
      break;
  }
}

function classifyFailure(error: string): PlanReflectionKind | "transient" | "unknown" {
  const lowered = error.toLowerCase();
  if (SCHEMA_DRIFT_PATTERNS.some((pattern) => lowered.includes(pattern))) {
    return "schema_drift";
  }
  if (ENVIRONMENT_SHIFT_PATTERNS.some((pattern) => lowered.includes(pattern))) {
    return "environment_shift";
  }
  if (TRANSIENT_ERRORS.some((pattern) => lowered.includes(pattern.toLowerCase()))) {
    return "transient";
  }
  return "unknown";
}

function buildAlternativeNode(
  tree: GoalTree,
  failedNode: PlanNode,
  kind: PlanReflectionKind,
  error: string,
): PlanNode {
  const now = Date.now();
  return {
    id: uuid(),
    parentId: failedNode.parentId,
    goal: `Alternate path for: ${failedNode.goal}`,
    taskType: failedNode.taskType,
    payload: {
      ...failedNode.payload,
      _dynamicAlternativeFor: failedNode.id,
      _reflectionKind: kind,
      _reflectionReason: error.slice(0, 500),
      _rootGoal: tree.rootGoal,
    },
    dependsOn: failedNode.dependsOn.filter(
      (depId) => tree.nodes.find((node) => node.id === depId)?.status !== "failed",
    ),
    status: "pending",
    retries: 0,
    maxRetries: failedNode.maxRetries,
    priority: (failedNode.priority ?? 0) + 10,
    dynamic: true,
    alternativeFor: failedNode.id,
    injectedBy: "repair",
    metadata: {
      reflectionKind: kind,
      originalTaskType: failedNode.taskType,
    },
    createdAt: now,
    updatedAt: now,
  };
}

function applyRewire(
  tree: GoalTree,
  rewires: NonNullable<PlanRepairStrategy["rewire"]>,
): void {
  for (const patch of rewires) {
    const target = tree.nodes.find((node) => node.id === patch.nodeId);
    if (!target) continue;
    const deps = new Set(target.dependsOn);
    for (const remove of patch.removeDeps ?? []) deps.delete(remove);
    for (const add of patch.addDeps ?? []) deps.add(add);
    target.dependsOn = [...deps];
    target.updatedAt = Date.now();
  }
}

function blockDownstream(tree: GoalTree, failedNodeId: string, reason: string): void {
  const blocked = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of tree.nodes) {
      if (node.status !== "pending") continue;
      if (
        node.dependsOn.includes(failedNodeId) ||
        node.dependsOn.some((depId) => blocked.has(depId))
      ) {
        node.status = "blocked";
        node.error = `Blocked by failed prerequisite: ${reason}`;
        node.updatedAt = Date.now();
        blocked.add(node.id);
        changed = true;
      }
    }
  }
}

function appendRevision(
  tree: GoalTree,
  kind: PlanRevision["kind"],
  reason: string,
  affectedNodeIds: string[],
  injectedNodeIds: string[],
): void {
  const revision: PlanRevision = {
    id: uuid(),
    ts: Date.now(),
    kind,
    reason,
    affectedNodeIds,
    injectedNodeIds,
  };
  tree.revisions = [...(tree.revisions ?? []), revision];
}

function refreshRuntimeState(tree: GoalTree): void {
  const maxConcurrency = tree.runtime?.maxConcurrency ?? tree.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
  tree.runtime = {
    activeNodeIds: tree.nodes.filter((node) => node.status === "active").map((node) => node.id),
    completedNodeIds: tree.nodes.filter((node) => node.status === "done").map((node) => node.id),
    failedNodeIds: tree.nodes.filter((node) => node.status === "failed").map((node) => node.id),
    blockedNodeIds: tree.nodes.filter((node) => node.status === "blocked").map((node) => node.id),
    maxConcurrency,
  };
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
  const blocked = tree.nodes.filter((n) => n.status === "blocked").length;

  return {
    total,
    done,
    failed,
    active,
    skipped,
    blocked,
    percent: total === 0 ? 0 : Math.round(((done + skipped) / total) * 100),
  };
}

// ---------------------------------------------------------------------------
// Async DAG runtime
// ---------------------------------------------------------------------------

export class TaskGraphRuntime {
  constructor(
    private readonly tree: GoalTree,
    private readonly executor: PlanNodeExecutor,
  ) {
    normalizeGraph(this.tree);
  }

  get snapshot(): GoalTree {
    return this.tree;
  }

  async tick(): Promise<GoalTree> {
    const runnable = nextExecutable(this.tree);
    if (runnable.length === 0) return this.tree;

    for (const node of runnable) {
      node.status = "active";
      node.updatedAt = Date.now();
    }
    refreshRuntimeState(this.tree);

    const results = await Promise.allSettled(
      runnable.map(async (node) => ({
        node,
        result: await this.executor(node, this.tree),
      })),
    );

    for (const settled of results) {
      if (settled.status === "rejected") {
        const node = runnable[results.indexOf(settled)];
        advance(
          this.tree,
          node.id,
          false,
          undefined,
          settled.reason instanceof Error
            ? settled.reason.message
            : String(settled.reason),
        );
        continue;
      }

      const { node, result } = settled.value;
      if (result.reflection) {
        applyReflectionPatch(this.tree, result.reflection);
      }
      advance(this.tree, node.id, result.success, result.result, result.error);
    }

    return this.tree;
  }

  reflect(patch: ReflectionPatch): GoalTree {
    applyReflectionPatch(this.tree, patch);
    return this.tree;
  }
}

export class TaskGraphRuntimeManager {
  private runtimes = new Map<string, TaskGraphRuntime>();

  register(tree: GoalTree, executor: PlanNodeExecutor): TaskGraphRuntime {
    const runtime = new TaskGraphRuntime(tree, executor);
    this.runtimes.set(tree.id, runtime);
    return runtime;
  }

  get(treeId: string): TaskGraphRuntime | undefined {
    return this.runtimes.get(treeId);
  }

  async tickAll(): Promise<GoalTree[]> {
    return Promise.all([...this.runtimes.values()].map((runtime) => runtime.tick()));
  }

  reflect(treeId: string, patch: ReflectionPatch): GoalTree | undefined {
    return this.runtimes.get(treeId)?.reflect(patch);
  }
}

export function applyReflectionPatch(
  tree: GoalTree,
  patch: ReflectionPatch,
): GoalTree {
  normalizeGraph(tree);
  const now = Date.now();
  const injectedNodeIds: string[] = [];
  for (const partial of patch.newNodes ?? []) {
    const node: PlanNode = {
      id: partial.id ?? uuid(),
      parentId: partial.parentId ?? null,
      goal: partial.goal,
      taskType: partial.taskType,
      payload: partial.payload ?? {},
      dependsOn: partial.dependsOn ?? [],
      status: partial.status ?? "pending",
      result: partial.result,
      error: partial.error,
      retries: partial.retries ?? 0,
      maxRetries: partial.maxRetries ?? 2,
      priority: partial.priority ?? 50,
      dynamic: true,
      alternativeFor: partial.alternativeFor,
      injectedBy: "reflection",
      metadata: {
        ...(partial.metadata ?? {}),
        reflectionKind: patch.kind,
      },
      createdAt: partial.createdAt ?? now,
      updatedAt: now,
    };
    tree.nodes.push(node);
    injectedNodeIds.push(node.id);
  }
  applyRewire(tree, patch.rewire ?? []);
  if (patch.sandboxSkillId) {
    for (const node of tree.nodes) {
      if (node.payload?.skillId === patch.sandboxSkillId) {
        node.status = "blocked";
        node.error = `Capability sandboxed: ${patch.sandboxSkillId}`;
      }
    }
  }
  if (!isAcyclic(tree)) {
    throw new Error("Reflection patch introduced a dependency cycle");
  }
  tree.updatedAt = now;
  appendRevision(
    tree,
    patch.kind,
    patch.reason,
    patch.affectedNodeIds ?? [],
    injectedNodeIds,
  );
  refreshRuntimeState(tree);
  return tree;
}

export function isAcyclic(tree: GoalTree): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byId = new Map(tree.nodes.map((node) => [node.id, node]));

  const visit = (nodeId: string): boolean => {
    if (visited.has(nodeId)) return true;
    if (visiting.has(nodeId)) return false;
    const node = byId.get(nodeId);
    if (!node) return true;
    visiting.add(nodeId);
    for (const dep of node.dependsOn) {
      if (!visit(dep)) return false;
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    return true;
  };

  return tree.nodes.every((node) => visit(node.id));
}

function normalizeGraph(tree: GoalTree): void {
  tree.graphVersion = "dag-v2";
  tree.maxConcurrency = tree.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
  refreshRuntimeState(tree);
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
  PlanNodeExecutor,
  PlanProgress,
  PlanRepairStrategy,
  ReflectionPatch,
} from "./types.js";
