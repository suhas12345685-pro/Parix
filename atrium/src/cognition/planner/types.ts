export type PlanNodeStatus =
  | "pending"
  | "active"
  | "done"
  | "failed"
  | "skipped"
  | "blocked";

export type PlanRepairAction =
  | "retry"
  | "skip"
  | "replan_subtree"
  | "inject_alternative"
  | "sandbox"
  | "escalate";

export type PlanReflectionKind =
  | "environment_shift"
  | "schema_drift"
  | "capability_degraded"
  | "dependency_failed"
  | "operator_override";

export interface PlanNode {
  id: string;
  parentId: string | null;
  goal: string;
  taskType: string;
  payload: Record<string, unknown>;
  dependsOn: string[];
  status: PlanNodeStatus;
  result?: string;
  error?: string;
  retries: number;
  maxRetries: number;
  priority?: number;
  dynamic?: boolean;
  alternativeFor?: string;
  injectedBy?: "decomposition" | "reflection" | "repair";
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface PlanRevision {
  id: string;
  ts: number;
  kind: PlanReflectionKind | PlanRepairAction | "decomposition";
  reason: string;
  affectedNodeIds: string[];
  injectedNodeIds: string[];
}

export interface PlanRuntimeState {
  activeNodeIds: string[];
  completedNodeIds: string[];
  failedNodeIds: string[];
  blockedNodeIds: string[];
  maxConcurrency: number;
}

export interface GoalTree {
  id: string;
  rootGoal: string;
  trigger: string;
  nodes: PlanNode[];
  graphVersion?: "dag-v2";
  maxConcurrency?: number;
  revisions?: PlanRevision[];
  runtime?: PlanRuntimeState;
  status: "active" | "completed" | "failed" | "suspended";
  createdAt: number;
  updatedAt: number;
}

export interface PlanRepairStrategy {
  failedNodeId: string;
  strategy: PlanRepairAction;
  reason: string;
  newNodes?: PlanNode[];
  rewire?: Array<{
    nodeId: string;
    removeDeps?: string[];
    addDeps?: string[];
  }>;
  sandboxSkillId?: string;
}

export interface PlanProgress {
  total: number;
  done: number;
  failed: number;
  active: number;
  skipped: number;
  blocked?: number;
  percent: number;
}

export interface ReflectionPatch {
  kind: PlanReflectionKind;
  reason: string;
  affectedNodeIds?: string[];
  newNodes?: Array<
    Partial<PlanNode> & {
      goal: string;
      taskType: string;
      payload?: Record<string, unknown>;
      dependsOn?: string[];
    }
  >;
  rewire?: PlanRepairStrategy["rewire"];
  sandboxSkillId?: string;
}

export interface PlanExecutionResult {
  success: boolean;
  result?: string;
  error?: string;
  reflection?: ReflectionPatch;
}

export type PlanNodeExecutor = (
  node: PlanNode,
  tree: GoalTree,
) => Promise<PlanExecutionResult>;
