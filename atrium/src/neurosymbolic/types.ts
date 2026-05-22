import type { CognitiveEvent } from "../cognition/types.js";

export type NeuroSymbolicSource =
  | "local"
  | "python-sidecar"
  | "synalinks"
  | "hybridagi"
  | "torchlogic";

export interface NeuroFact {
  predicate: string;
  args: string[];
  truth: number;
  source: NeuroSymbolicSource;
  evidence?: string[];
}

export interface ActionIR {
  id: string;
  kind: "cli" | "notification" | "none" | string;
  payload: Record<string, unknown>;
  confidence: number;
  utility: number;
  risk: number;
  reversibility: number;
  explanation: string;
  capabilities: string[];
  provenance: NeuroSymbolicSource[];
}

export type SymbolicVerdict = "ALLOW" | "DENY" | "REWRITE" | "ASK_USER";

export interface SymbolicDecision {
  verdict: SymbolicVerdict;
  ruleId: string;
  explanation: string;
  action: ActionIR | null;
  originalAction: ActionIR;
}

export interface ActionScore {
  actionId: string;
  score: number;
  goalSatisfaction: number;
  safetySatisfaction: number;
  formula: string;
}

export interface NeuroSymbolicTrace {
  event: CognitiveEvent;
  facts: NeuroFact[];
  candidates: ActionIR[];
  symbolicDecisions: SymbolicDecision[];
  scores: ActionScore[];
  selectedActionId: string | null;
  verdict: SymbolicVerdict | "NO_ACTION";
  latencyMs: number;
  sources: {
    perception: NeuroSymbolicSource;
    behavior: NeuroSymbolicSource;
    optimizer: NeuroSymbolicSource;
  };
}

export interface NeuroSymbolicDecision {
  action: ActionIR | null;
  verdict: NeuroSymbolicTrace["verdict"];
  reason: string;
  trace: NeuroSymbolicTrace;
}

export interface RuntimeContext {
  handsStatus: string;
  confidence: number;
  context: Record<string, unknown>;
}

export interface SidecarRequest<T = unknown> {
  id: string;
  method: "perceive" | "behavior_graph" | "optimize";
  payload: T;
}

export interface SidecarResponse<T = unknown> {
  id: string;
  ok: boolean;
  result?: T;
  error?: string;
}

