import type { ActionIR, ActionScore, SymbolicDecision } from "./types.js";

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function lNot(x: number): number {
  return clamp01(1 - clamp01(x));
}

export function lAnd(...values: number[]): number {
  if (values.length === 0) return 1;
  return clamp01(
    values.reduce((sum, value) => sum + clamp01(value), 0) -
      values.length +
      1,
  );
}

export function lOr(...values: number[]): number {
  return clamp01(values.reduce((sum, value) => sum + clamp01(value), 0));
}

export function implication(x: number, y: number): number {
  return clamp01(1 - clamp01(x) + clamp01(y));
}

export function symbolicSafety(decision: SymbolicDecision): number {
  switch (decision.verdict) {
    case "ALLOW":
      return 1;
    case "REWRITE":
      return 0.82;
    case "ASK_USER":
      return 0.58;
    case "DENY":
      return 0;
  }
}

export function scoreAction(decision: SymbolicDecision): ActionScore {
  const action = decision.action ?? decision.originalAction;
  const confidence = clamp01(action.confidence);
  const utility = clamp01(action.utility);
  const risk = clamp01(action.risk);
  const reversibility = clamp01(action.reversibility);
  const safety = symbolicSafety(decision);

  const goalSatisfaction = lAnd(utility, confidence);
  const safetySatisfaction = lAnd(safety, implication(risk, safety), lOr(reversibility, lNot(risk)));
  const score = clamp01(
    0.42 * goalSatisfaction +
      0.38 * safetySatisfaction +
      0.15 * reversibility +
      0.05 * confidence,
  );

  return {
    actionId: action.id,
    score,
    goalSatisfaction,
    safetySatisfaction,
    formula:
      "score = 0.42 * LAnd(utility, confidence) + 0.38 * LAnd(safety, I(risk, safety), LOr(reversibility, LNot(risk))) + 0.15 * reversibility + 0.05 * confidence",
  };
}

export function rankActions(decisions: SymbolicDecision[]): ActionScore[] {
  return decisions
    .map(scoreAction)
    .sort((a, b) => b.score - a.score);
}

export function normalizeAction(action: Partial<ActionIR> & Pick<ActionIR, "id" | "kind" | "payload">): ActionIR {
  return {
    ...action,
    confidence: clamp01(action.confidence ?? 0.5),
    utility: clamp01(action.utility ?? 0.5),
    risk: clamp01(action.risk ?? 0.5),
    reversibility: clamp01(action.reversibility ?? 0.5),
    explanation: action.explanation ?? `${action.kind} action`,
    capabilities: action.capabilities ?? [],
    provenance: action.provenance ?? ["local"],
  };
}
