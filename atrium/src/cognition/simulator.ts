import { v4 as uuid } from "uuid";
import type {
  CandidateAction,
  DesireInference,
  Hypothesis,
  SimulationResult,
} from "./types.js";

export function proposeActions(
  desire: DesireInference,
  hypotheses: Hypothesis[],
): CandidateAction[] {
  const top = hypotheses[0];
  const actions: CandidateAction[] = [];

  if (!desire.interrupt && desire.silentPrep.length > 0) {
    actions.push({
      id: uuid(),
      taskType: "none",
      payload: { silentPrep: desire.silentPrep },
      reason:
        "prepare silently because interruption cost is higher than urgency",
      reversibility: 1,
    });
  }

  if (desire.interrupt) {
    actions.push({
      id: uuid(),
      taskType: "notification",
      payload: {
        title: "Parix noticed something",
        body: `${desire.userNeed}. Likely: ${top?.explanation ?? desire.inferredGoal}.`,
        urgency: desire.confidence > 0.85 ? "high" : "medium",
        actions: desire.suggestedHelp.slice(0, 3).map((label, index) => ({
          label,
          value: `cognitive_help_${index}`,
        })),
      },
      reason: "high-confidence inferred need with useful interruption",
      reversibility: 1,
    });
  }

  actions.push({
    id: uuid(),
    taskType: "none",
    payload: {},
    reason: "observe only until more evidence appears",
    reversibility: 1,
  });

  return actions;
}

export function simulateActions(
  actions: CandidateAction[],
  hypotheses: Hypothesis[],
): SimulationResult[] {
  const topConfidence = hypotheses[0]?.confidence ?? 0.5;
  return actions.map((action) => ({
    actionId: action.id,
    expectedOutcome:
      action.taskType === "notification"
        ? "user receives a context-aware offer with clear choices"
        : action.taskType === "none" && Array.isArray(action.payload.silentPrep)
          ? "Parix keeps context warm without interrupting"
          : "Parix waits for clearer evidence",
    confidence: Math.min(1, (topConfidence + action.reversibility) / 2),
    risks:
      action.taskType === "notification"
        ? ["could interrupt at the wrong time"]
        : [],
    requiredEvidence:
      action.taskType === "notification" ? [] : ["additional signals"],
  }));
}
