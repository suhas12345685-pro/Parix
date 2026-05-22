import { constitution } from "../intelligence/constitution.js";
import { scoreReversibility } from "../intelligence/reversibility.js";
import { normalizeAction } from "./lukasiewicz.js";
import type { ActionIR, RuntimeContext, SymbolicDecision } from "./types.js";

function toTaskType(kind: string): string {
  if (kind === "notify") return "notification";
  return kind;
}

function payloadSummary(action: ActionIR): string {
  if (typeof action.payload.command === "string") return action.payload.command;
  if (Array.isArray(action.payload.argv)) return action.payload.argv.join(" ");
  if (typeof action.payload.title === "string") return action.payload.title;
  return action.kind;
}

function notificationOverride(action: ActionIR, reason: string): ActionIR {
  return normalizeAction({
    id: `${action.id}:override`,
    kind: "notification",
    payload: {
      title: "Action Needs Review",
      body: `${reason}. Proposed action: ${payloadSummary(action).slice(0, 160)}`,
      urgency: "high",
      originalActionId: action.id,
    },
    confidence: action.confidence,
    utility: Math.max(0.45, action.utility * 0.75),
    risk: 0.04,
    reversibility: 1,
    explanation: `Symbolic override downgraded unsafe action: ${reason}`,
    capabilities: ["notify"],
    provenance: [...new Set([...action.provenance, "local" as const])],
  });
}

export function evaluateAction(
  action: ActionIR,
  runtime: RuntimeContext,
): SymbolicDecision {
  const taskType = toTaskType(action.kind);
  const reversibility =
    action.reversibility ?? scoreReversibility(taskType, action.payload);
  const verdict = constitution.check(taskType, action.payload, {
    reversibilityScore: reversibility,
    confidence: runtime.confidence,
    handsStatus: runtime.handsStatus,
  });

  if (verdict.allowed) {
    return {
      verdict: "ALLOW",
      ruleId: "constitution.allow",
      explanation: "Action satisfies symbolic policy.",
      action,
      originalAction: action,
    };
  }

  const override = notificationOverride(action, verdict.reason);
  const overrideVerdict = constitution.check("notification", override.payload, {
    reversibilityScore: 1,
    confidence: runtime.confidence,
    handsStatus: runtime.handsStatus,
  });

  if (overrideVerdict.allowed) {
    return {
      verdict: "ASK_USER",
      ruleId: "symbolic.override.notification",
      explanation: `Blocked original action and substituted a review notification: ${verdict.reason}`,
      action: override,
      originalAction: action,
    };
  }

  return {
    verdict: "DENY",
    ruleId: "constitution.deny",
    explanation: verdict.reason,
    action: null,
    originalAction: action,
  };
}

export function evaluateActions(
  actions: ActionIR[],
  runtime: RuntimeContext,
): SymbolicDecision[] {
  return actions.map((action) => evaluateAction(action, runtime));
}

