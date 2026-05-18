export type PlanNodeStatus =
  | "pending"
  | "active"
  | "done"
  | "failed"
  | "skipped";

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
  createdAt: number;
  updatedAt: number;
}

export interface GoalTree {
  id: string;
  rootGoal: string;
  trigger: string;
  nodes: PlanNode[];
  status: "active" | "completed" | "failed" | "suspended";
  createdAt: number;
  updatedAt: number;
}

export interface PlanRepairStrategy {
  failedNodeId: string;
  strategy: "retry" | "skip" | "replan_subtree" | "escalate";
  reason: string;
  newNodes?: PlanNode[];
}

export interface PlanProgress {
  total: number;
  done: number;
  failed: number;
  active: number;
  skipped: number;
  percent: number;
}
