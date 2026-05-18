import type { GoalTree } from "../planner/types.js";

export type AutonomyLevel = "observe" | "assist" | "autonomous";

export interface CreativeBrief {
  goal: string;
  context?: string;
  constraints?: string[];
  successCriteria?: string[];
  autonomyLevel?: AutonomyLevel;
  maxIterations?: number;
  /** Minimum chosen-idea score (0..1) to auto-accept without escalation. */
  acceptThreshold?: number;
  /** Optional hint about domain (e.g. "design", "writing", "code", "strategy"). */
  domain?: string;
}

export interface CreativeIdea {
  id: string;
  description: string;
  rationale: string;
  novelty: number;
  feasibility: number;
  alignment: number;
  risk: number;
  tags: string[];
}

export interface CreativeCritique {
  ideaId: string;
  score: number;
  strengths: string[];
  weaknesses: string[];
  refinements: string[];
}

export interface CreativeIteration {
  index: number;
  ideas: CreativeIdea[];
  critiques: CreativeCritique[];
  chosen: CreativeIdea;
  chosenScore: number;
  refinements: string[];
}

export type AutonomousStatus =
  | "completed"
  | "failed"
  | "awaiting_user"
  | "running";

export interface AutonomousRun {
  id: string;
  brief: CreativeBrief;
  iterations: CreativeIteration[];
  plan: GoalTree | null;
  result: {
    summary: string;
    chosenIdea: CreativeIdea | null;
    artifacts: string[];
    score: number;
  };
  status: AutonomousStatus;
  escalationReason?: string;
  startedAt: number;
  finishedAt?: number;
}

export interface Ideator {
  (brief: CreativeBrief, iteration: number, prior: CreativeIdea[]): Promise<
    CreativeIdea[]
  > | CreativeIdea[];
}

export interface Executor {
  (
    plan: GoalTree,
    idea: CreativeIdea,
    brief: CreativeBrief,
  ): Promise<{ artifacts: string[]; summary: string }>
    | { artifacts: string[]; summary: string };
}

export interface AutonomousOptions {
  ideator?: Ideator;
  executor?: Executor;
  /** Inject deterministic time for tests. */
  now?: () => number;
}
