import type { ConstitutionVerdict } from "./constitution.js";

export type RuntimeAutonomyLevel =
  | "ask-before-fix"
  | "always-ask"
  | "safe-auto-fix"
  | "safe-auto"
  | "full-auto"
  | "policy-based";

export interface AutonomyContext {
  reversibilityScore: number;
  confidence: number;
}

interface AutonomyThresholds {
  minReversibility: number;
  cautiousBandMinReversibility: number;
  cautiousBandMinConfidence: number;
}

const THRESHOLDS: Record<RuntimeAutonomyLevel, AutonomyThresholds> = {
  "ask-before-fix": {
    minReversibility: 0.9,
    cautiousBandMinReversibility: 0.9,
    cautiousBandMinConfidence: 1,
  },
  "always-ask": {
    minReversibility: 0.9,
    cautiousBandMinReversibility: 0.9,
    cautiousBandMinConfidence: 1,
  },
  "safe-auto-fix": {
    minReversibility: 0.5,
    cautiousBandMinReversibility: 0.8,
    cautiousBandMinConfidence: 0.85,
  },
  "safe-auto": {
    minReversibility: 0.5,
    cautiousBandMinReversibility: 0.8,
    cautiousBandMinConfidence: 0.85,
  },
  "full-auto": {
    minReversibility: 0.2,
    cautiousBandMinReversibility: 0.5,
    cautiousBandMinConfidence: 0.95,
  },
  "policy-based": {
    minReversibility: 0.2,
    cautiousBandMinReversibility: 0.5,
    cautiousBandMinConfidence: 0.95,
  },
};

export function evaluateAutonomy(
  rawLevel: string,
  ctx: AutonomyContext,
): ConstitutionVerdict | null {
  const level = normalizeAutonomyLevel(rawLevel);
  const thresholds = THRESHOLDS[level];

  if (ctx.reversibilityScore < thresholds.minReversibility) {
    return {
      allowed: false,
      reason: `Autonomy level "${level}": reversibility ${ctx.reversibilityScore.toFixed(2)} below hard floor ${thresholds.minReversibility.toFixed(2)}`,
    };
  }

  if (
    ctx.reversibilityScore < thresholds.cautiousBandMinReversibility &&
    ctx.confidence < thresholds.cautiousBandMinConfidence
  ) {
    return {
      allowed: false,
      reason: `Autonomy level "${level}": confidence ${ctx.confidence.toFixed(2)} too low for reversibility ${ctx.reversibilityScore.toFixed(2)} (need ${thresholds.cautiousBandMinConfidence.toFixed(2)})`,
    };
  }

  return null;
}

export function describeAutonomyLevel(rawLevel: string): string {
  const level = normalizeAutonomyLevel(rawLevel);
  const thresholds = THRESHOLDS[level];
  return `level=${level}, min_reversibility=${thresholds.minReversibility.toFixed(2)}, cautious_band<${thresholds.cautiousBandMinReversibility.toFixed(2)} needs confidence>=${thresholds.cautiousBandMinConfidence.toFixed(2)}`;
}

function normalizeAutonomyLevel(rawLevel: string): RuntimeAutonomyLevel {
  if (rawLevel in THRESHOLDS) return rawLevel as RuntimeAutonomyLevel;
  return "safe-auto-fix";
}
