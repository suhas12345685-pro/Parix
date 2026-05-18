import type { AttentionState } from "./attention.js";
import type { MetacognitiveAssessment } from "./metacognition.js";
import type { PlanProgress } from "./planner/types.js";

export interface CognitiveEvent {
  type: string;
  data: Record<string, unknown>;
  confidence: number;
  timestamp: number;
}

export interface FocusedElement {
  role: string;
  name: string;
  value?: string | null;
  state: string[];
  bounds?: number[] | null;
}

export interface WorkingMemory {
  currentGoal: string | null;
  activeApp: string | null;
  activeProject: string | null;
  recentSignals: CognitiveEvent[];
  blockers: string[];
  assumptions: string[];
  uncertainty: number;
  /** Currently focused UI element from the accessibility layer, if known. */
  focusedElement: FocusedElement | null;
  updatedAt: number;
}

export interface UserPreference {
  key: string;
  value: string;
  confidence: number;
  evidence: string[];
}

export interface WorldFact {
  key: string;
  value: string;
  confidence: number;
  evidence: string[];
}

export interface DesireInference {
  inferredGoal: string;
  userNeed: string;
  evidence: string[];
  confidence: number;
  suggestedHelp: string[];
  silentPrep: string[];
  interrupt: boolean;
  reasonToInterrupt?: string;
}

export interface Hypothesis {
  id: string;
  explanation: string;
  evidence: string[];
  confidence: number;
  missingEvidence: string[];
}

export interface CandidateAction {
  id: string;
  taskType: "cli" | "notification" | "none" | string;
  payload: Record<string, unknown>;
  reason: string;
  reversibility: number;
}

export interface SimulationResult {
  actionId: string;
  expectedOutcome: string;
  confidence: number;
  risks: string[];
  requiredEvidence: string[];
}

export interface CritiqueResult {
  actionId: string;
  approved: boolean;
  concerns: string[];
  missingEvidence: string[];
  betterAlternative?: string;
}

// A single skill the cognition layer believes is applicable for the
// current event. Emitted in `decision.toolCalls`; council runs them in
// parallel (under the fan-out cap) and aggregates the results.
export interface SkillToolCall {
  skillId: string;
  // Inputs to feed the skill's stdin. Today this is event.data; richer
  // mapping (manifest input schema) will come once the registry exposes it.
  inputs: Record<string, unknown>;
  // Manifest-declared reversibility — duplicated here so council/critic
  // don't have to round-trip to the registry just to score parallel calls.
  reversibility: number;
}

export interface CognitiveDecision {
  mode: "reflex" | "normal" | "deep" | "research";
  desire: DesireInference;
  hypotheses: Hypothesis[];
  simulations: SimulationResult[];
  critiques: CritiqueResult[];
  recommendedAction: CandidateAction;
  // 0..N skills cognition believes apply right now. Always populated
  // (empty array when no skill matches). Council fans these out under
  // the per-task concurrency cap.
  toolCalls: SkillToolCall[];
  confidence: number;
  shouldAct: boolean;
  shouldInterrupt: boolean;
}

export interface CognitiveSnapshot {
  workingMemory: WorkingMemory;
  preferences: UserPreference[];
  worldFacts: WorldFact[];
  decision: CognitiveDecision;
  attention?: {
    focus: string | null;
    strength: number;
    admitRate: number;
    suppressedCount?: number;
  };
  attentionState?: AttentionState;
  metacognition?: MetacognitiveAssessment;
  activePlan?: PlanProgress;
}
