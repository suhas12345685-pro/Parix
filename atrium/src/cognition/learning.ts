import { upsertFact } from "./store.js";
import type { CognitiveDecision } from "./types.js";
import { recordCalibration } from "./metacognition.js";
import { getLastCognitiveSnapshot } from "./index.js";

export function learnFromDecision(decision: CognitiveDecision): void {
  upsertFact({
    key: `goal:${hash(decision.desire.inferredGoal)}`,
    value: decision.desire.inferredGoal,
    kind: "goal",
    confidence: decision.confidence,
    evidence: JSON.stringify(decision.desire.evidence.slice(0, 8)),
  });

  if (decision.shouldInterrupt) {
    upsertFact({
      key: "attention_prefers_relevant_interrupts",
      value: "interruptions should be tied to high-confidence inferred needs",
      kind: "preference",
      confidence: 0.55,
      evidence: JSON.stringify([
        decision.desire.reasonToInterrupt ?? "interrupted",
      ]),
    });
  }
}

export function learnFromOutcome(
  taskType: string,
  success: boolean,
  reason: string,
): void {
  const lastSnapshot = getLastCognitiveSnapshot();
  if (lastSnapshot) {
    recordCalibration(lastSnapshot.decision.confidence, success);
  }

  upsertFact({
    key: `outcome:${taskType}`,
    value: success ? "recently successful" : "recently failed",
    kind: "belief",
    confidence: success ? 0.7 : 0.45,
    evidence: JSON.stringify([reason]),
  });
}

function hash(value: string): string {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (Math.imul(31, h) + value.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}
