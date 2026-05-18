import type {
  CandidateAction,
  CritiqueResult,
  DesireInference,
  SimulationResult,
} from "./types.js";

export function critiqueActions(
  actions: CandidateAction[],
  simulations: SimulationResult[],
  desire: DesireInference,
): CritiqueResult[] {
  return actions.map((action) => {
    const simulation = simulations.find((item) => item.actionId === action.id);
    const concerns: string[] = [];
    const missingEvidence: string[] = [];

    if (action.taskType === "notification" && !desire.interrupt) {
      concerns.push("desire model says not to interrupt");
    }
    if ((simulation?.confidence ?? 0) < 0.55) {
      concerns.push("low predicted usefulness");
      missingEvidence.push(...(simulation?.requiredEvidence ?? []));
    }
    if (action.reversibility < 0.8) {
      concerns.push("action is not reversible enough for inferred intent");
    }

    return {
      actionId: action.id,
      approved: concerns.length === 0,
      concerns,
      missingEvidence: [...new Set(missingEvidence)],
      betterAlternative:
        concerns.length > 0
          ? "prefer silent preparation or observation"
          : undefined,
    };
  });
}
