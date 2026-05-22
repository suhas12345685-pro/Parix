import type { CognitiveEvent } from "../types.js";
import {
  maybeCreateDependencyForesight,
  type DependencyForesightDraft,
} from "./dependency-foresight.js";
import {
  maybeCreateErrorShadow,
  type ErrorShadowDraft,
} from "./error-shadow.js";

export type PulsePrecomputeResult =
  | { kind: "dependency_foresight"; draft: DependencyForesightDraft }
  | { kind: "error_shadow"; draft: ErrorShadowDraft };

export function runPulsePrecompute(
  event: CognitiveEvent,
): PulsePrecomputeResult[] {
  const results: PulsePrecomputeResult[] = [];

  const dependencyDraft = maybeCreateDependencyForesight(event);
  if (dependencyDraft) {
    results.push({ kind: "dependency_foresight", draft: dependencyDraft });
  }

  const errorDraft = maybeCreateErrorShadow(event);
  if (errorDraft) {
    results.push({ kind: "error_shadow", draft: errorDraft });
  }

  return results;
}
