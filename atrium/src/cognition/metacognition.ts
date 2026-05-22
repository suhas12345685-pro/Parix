import type { DesireInference, Hypothesis, WorkingMemory } from "./types.js";
import type { GoalTree } from "./planner/types.js";
import { getDb, persistToFile } from "../memory/db.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CognitiveStrategy =
  | "reflex"
  | "deliberate"
  | "ask_user"
  | "defer"
  | "delegate";

export interface MetacognitiveAssessment {
  strategy: CognitiveStrategy;
  reason: string;
  confidenceInStrategy: number;
  cognitiveLoad: number;
  timeBudgetMs: number;
  shouldExplain: boolean;
  sandboxedCapabilityId?: string;
  asyncEscalation?: {
    channel: "slack" | "teams" | "aegis" | "telegram";
    ticket: Record<string, unknown>;
  };
}

interface CalibrationRecord {
  predictedConfidence: number;
  actualOutcome: boolean;
  timestamp: number;
  skillManifestId?: string;
}

export interface MetacognitiveContext {
  skillManifestId?: string;
  escalationChannel?: "slack" | "teams" | "aegis" | "telegram";
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const calibrationHistory: CalibrationRecord[] = [];
const skillCalibrationHistory = new Map<string, CalibrationRecord[]>();
const MAX_CALIBRATION_RECORDS = 200;
const CALIBRATION_WINDOW = 100;

let cachedCalibrationScore: number | null = null;
let calibrationDirty = true;
let attemptedCalibrationHydration = false;

// ---------------------------------------------------------------------------
// Main entry — given the situation, how should we think?
// ---------------------------------------------------------------------------

export function assess(
  desire: DesireInference,
  hypotheses: Hypothesis[],
  workingMemory: WorkingMemory,
  activeGoalTrees: GoalTree[],
  hasSkillCacheHit: boolean = false,
  context: MetacognitiveContext = {},
): MetacognitiveAssessment {
  const load = computeLoad(activeGoalTrees, workingMemory);
  const calibration = context.skillManifestId
    ? getSkillCalibrationScore(context.skillManifestId)
    : getCalibrationScore();
  const topConf = hypotheses[0]?.confidence ?? 0;
  const spread = hypothesisSpread(hypotheses);
  const reversibility = estimateReversibility(desire);

  // ------ Strategy selection (ordered by speed) ------

  // REFLEX: high confidence, known pattern, low load
  if (topConf > 0.85 && hasSkillCacheHit && load < 0.4) {
    return build(
      "reflex",
      "High confidence + cached pattern + low load",
      0.9,
      load,
      500,
      false,
    );
  }

  // DELEGATE: if the desire maps cleanly to a known skill
  if (hasSkillCacheHit && topConf > 0.7 && load < 0.6) {
    return build(
      "delegate",
      "Cache hit with moderate confidence",
      0.8,
      load,
      1000,
      false,
    );
  }

  if (context.skillManifestId && calibration < 0.4 && topConf < 0.75) {
    return build(
      "delegate",
      `Capability ${context.skillManifestId} degraded by local calibration (${calibration.toFixed(2)}); sandboxing that path and continuing unrelated work`,
      0.65,
      load,
      1000,
      false,
      {
        sandboxedCapabilityId: context.skillManifestId,
        asyncEscalation: {
          channel: context.escalationChannel ?? "aegis",
          ticket: {
            skillManifestId: context.skillManifestId,
            calibration,
            topConfidence: topConf,
            rootGoal: desire.inferredGoal,
          },
        },
      },
    );
  }

  // ASK_USER: when we're uncertain and the stakes are high
  if (shouldAskUser(topConf, calibration, reversibility, load, desire)) {
    const reason = buildAskReason(topConf, calibration, reversibility, load);
    return build("ask_user", reason, 0.85, load, 30000, true);
  }

  // DEFER: low urgency, high uncertainty, wait for more data
  if (shouldDefer(desire, topConf, load, workingMemory)) {
    return build(
      "defer",
      "Low urgency + high uncertainty, waiting for more evidence",
      0.7,
      load,
      0,
      false,
    );
  }

  // DELIBERATE: the default thoughtful path
  if (load < 0.7 && topConf >= 0.3) {
    const budget = spread < 0.15 ? 5000 : 8000;
    return build(
      "deliberate",
      `Multiple hypotheses (spread=${spread.toFixed(2)}), needs careful planning`,
      0.75,
      load,
      budget,
      spread < 0.1,
    );
  }

  // Fallback: overloaded or very uncertain → ask user
  return build(
    "ask_user",
    "System overloaded or deeply uncertain, need human input",
    0.6,
    load,
    30000,
    true,
  );
}

// ---------------------------------------------------------------------------
// Strategy decision helpers
// ---------------------------------------------------------------------------

function shouldAskUser(
  topConf: number,
  calibration: number,
  reversibility: number,
  load: number,
  desire: DesireInference,
): boolean {
  // All hypotheses are weak
  if (topConf < 0.45) return true;

  // Action could be destructive and we're not super confident
  if (reversibility < 0.5 && topConf < 0.8) return true;

  // We've been wrong a lot recently
  if (calibration < 0.4 && topConf < 0.75) return true;

  // Overwhelmed
  if (load > 0.8) return true;

  // The desire explicitly calls for user interrupt
  if (desire.interrupt && desire.confidence < 0.6) return true;

  return false;
}

function shouldDefer(
  desire: DesireInference,
  topConf: number,
  load: number,
  workingMemory: WorkingMemory,
): boolean {
  // Not urgent
  if (desire.interrupt) return false;

  // High uncertainty
  if (workingMemory.uncertainty > 0.7 && topConf < 0.5) return true;

  // Overloaded but not urgent
  if (load > 0.6 && topConf < 0.5) return true;

  return false;
}

function buildAskReason(
  topConf: number,
  calibration: number,
  reversibility: number,
  load: number,
): string {
  const reasons: string[] = [];
  if (topConf < 0.45) reasons.push(`low confidence (${topConf.toFixed(2)})`);
  if (reversibility < 0.5)
    reasons.push(`irreversible action (${reversibility.toFixed(2)})`);
  if (calibration < 0.4)
    reasons.push(`poor recent calibration (${calibration.toFixed(2)})`);
  if (load > 0.8) reasons.push(`high cognitive load (${load.toFixed(2)})`);
  return `Asking user: ${reasons.join(", ") || "uncertain situation"}`;
}

// ---------------------------------------------------------------------------
// Cognitive load — how overloaded is the system?
// ---------------------------------------------------------------------------

export function computeLoad(
  activeGoalTrees: GoalTree[],
  workingMemory: WorkingMemory,
): number {
  // Active plans contribute to load
  const planLoad = Math.min(0.4, activeGoalTrees.length * 0.1);

  // Pending nodes across all trees
  const totalPending = activeGoalTrees.reduce((sum, tree) => {
    return (
      sum +
      tree.nodes.filter((n) => n.status === "pending" || n.status === "active")
        .length
    );
  }, 0);
  const pendingLoad = Math.min(0.3, totalPending * 0.03);

  // Blockers add load
  const blockerLoad = Math.min(0.2, workingMemory.blockers.length * 0.05);

  // Uncertainty adds load
  const uncertaintyLoad = workingMemory.uncertainty * 0.1;

  return Math.min(1, planLoad + pendingLoad + blockerLoad + uncertaintyLoad);
}

// ---------------------------------------------------------------------------
// Calibration — are we accurate about our own confidence?
// ---------------------------------------------------------------------------

export function recordCalibration(
  predictedConfidence: number,
  actualOutcome: boolean,
): void {
  calibrationHistory.push({
    predictedConfidence,
    actualOutcome,
    timestamp: Date.now(),
  });

  try {
    getDb().run(
      "INSERT INTO calibration_records (predicted_confidence, actual_outcome) VALUES (?, ?)",
      [predictedConfidence, actualOutcome ? 1 : 0],
    );
    persistToFile();
  } catch {
    // Calibration still works in memory during isolated cognition tests.
  }

  // Trim old records
  if (calibrationHistory.length > MAX_CALIBRATION_RECORDS) {
    calibrationHistory.splice(
      0,
      calibrationHistory.length - MAX_CALIBRATION_RECORDS,
    );
  }

  calibrationDirty = true;
}

export function recordSkillCalibration(
  skillManifestId: string,
  predictedConfidence: number,
  actualOutcome: boolean,
): void {
  const record: CalibrationRecord = {
    predictedConfidence,
    actualOutcome,
    timestamp: Date.now(),
    skillManifestId,
  };
  const history = skillCalibrationHistory.get(skillManifestId) ?? [];
  history.push(record);
  if (history.length > MAX_CALIBRATION_RECORDS) {
    history.splice(0, history.length - MAX_CALIBRATION_RECORDS);
  }
  skillCalibrationHistory.set(skillManifestId, history);

  try {
    getDb().run(
      "INSERT INTO calibration_records (skill_manifest_id, predicted_confidence, actual_outcome) VALUES (?, ?, ?)",
      [skillManifestId, predictedConfidence, actualOutcome ? 1 : 0],
    );
    persistToFile();
  } catch {
    // Skill-local calibration still works in memory during tests.
  }

  calibrationDirty = true;
}

export function getCalibrationScore(): number {
  hydrateCalibrationFromDb();

  if (!calibrationDirty && cachedCalibrationScore !== null) {
    return cachedCalibrationScore;
  }

  const recent = calibrationHistory.slice(-CALIBRATION_WINDOW);
  if (recent.length === 0) {
    cachedCalibrationScore = 0.6;
    calibrationDirty = false;
    return 0.6;
  }

  // Brier score: measures probability calibration
  // Lower Brier = better calibration, but we invert to 0=bad, 1=good
  const brierSum = recent.reduce((sum, record) => {
    const actual = record.actualOutcome ? 1 : 0;
    return sum + (record.predictedConfidence - actual) ** 2;
  }, 0);

  const brierScore = brierSum / recent.length;
  cachedCalibrationScore = Math.max(0, 1 - brierScore);
  calibrationDirty = false;
  return cachedCalibrationScore;
}

export function getSkillCalibrationScore(skillManifestId: string): number {
  hydrateSkillCalibrationFromDb(skillManifestId);
  const recent = (skillCalibrationHistory.get(skillManifestId) ?? []).slice(
    -CALIBRATION_WINDOW,
  );
  if (recent.length === 0) return getCalibrationScore();

  const brierSum = recent.reduce((sum, record) => {
    const actual = record.actualOutcome ? 1 : 0;
    return sum + (record.predictedConfidence - actual) ** 2;
  }, 0);
  return Math.max(0, 1 - brierSum / recent.length);
}

export function hydrateCalibrationFromDb(): void {
  if (attemptedCalibrationHydration || calibrationHistory.length > 0) return;
  attemptedCalibrationHydration = true;

  try {
    const stmt = getDb().prepare(
      `SELECT predicted_confidence, actual_outcome, created_at
       FROM calibration_records
       ORDER BY id DESC
       LIMIT ?`,
    );
    stmt.bind([CALIBRATION_WINDOW]);

    const hydrated: CalibrationRecord[] = [];
    while (stmt.step()) {
      const [predictedConfidence, actualOutcome, timestamp] = stmt.get();
      hydrated.push({
        predictedConfidence: Number(predictedConfidence),
        actualOutcome: Number(actualOutcome) === 1,
        timestamp: Date.parse(String(timestamp)) || Date.now(),
      });
    }
    stmt.free();

    if (hydrated.length > 0) {
      calibrationHistory.push(...hydrated.reverse());
      calibrationDirty = true;
    }
  } catch {
    // DB may not be initialized during isolated cognition tests.
  }
}

function hydrateSkillCalibrationFromDb(skillManifestId: string): void {
  if (skillCalibrationHistory.has(skillManifestId)) return;

  try {
    const stmt = getDb().prepare(
      `SELECT predicted_confidence, actual_outcome, created_at
       FROM calibration_records
       WHERE skill_manifest_id = ?
       ORDER BY id DESC
       LIMIT ?`,
    );
    stmt.bind([skillManifestId, CALIBRATION_WINDOW]);

    const hydrated: CalibrationRecord[] = [];
    while (stmt.step()) {
      const [predictedConfidence, actualOutcome, timestamp] = stmt.get();
      hydrated.push({
        predictedConfidence: Number(predictedConfidence),
        actualOutcome: Number(actualOutcome) === 1,
        timestamp: Date.parse(String(timestamp)) || Date.now(),
        skillManifestId,
      });
    }
    stmt.free();
    skillCalibrationHistory.set(skillManifestId, hydrated.reverse());
  } catch {
    skillCalibrationHistory.set(skillManifestId, []);
  }
}

export function getCalibrationStats(): {
  score: number;
  totalRecords: number;
  recentOverconfident: number;
  recentUnderconfident: number;
} {
  const score = getCalibrationScore();
  const recent = calibrationHistory.slice(-CALIBRATION_WINDOW);

  let overconfident = 0;
  let underconfident = 0;

  for (const record of recent) {
    if (record.predictedConfidence > 0.7 && !record.actualOutcome)
      overconfident++;
    if (record.predictedConfidence < 0.4 && record.actualOutcome)
      underconfident++;
  }

  return {
    score,
    totalRecords: calibrationHistory.length,
    recentOverconfident: overconfident,
    recentUnderconfident: underconfident,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hypothesisSpread(hypotheses: Hypothesis[]): number {
  if (hypotheses.length < 2) return 1;
  return Math.abs(hypotheses[0].confidence - hypotheses[1].confidence);
}

function estimateReversibility(desire: DesireInference): number {
  const goal = desire.inferredGoal.toLowerCase();

  // Destructive-sounding goals
  if (
    goal.includes("delete") ||
    goal.includes("remove") ||
    goal.includes("drop")
  )
    return 0.2;
  if (
    goal.includes("restart") ||
    goal.includes("shutdown") ||
    goal.includes("kill")
  )
    return 0.4;
  if (goal.includes("install") || goal.includes("upgrade")) return 0.5;

  // Informational goals are safe
  if (
    goal.includes("debug") ||
    goal.includes("explain") ||
    goal.includes("check")
  )
    return 0.95;
  if (
    goal.includes("notify") ||
    goal.includes("alert") ||
    goal.includes("warn")
  )
    return 1.0;

  return 0.7;
}

function build(
  strategy: CognitiveStrategy,
  reason: string,
  confidenceInStrategy: number,
  cognitiveLoad: number,
  timeBudgetMs: number,
  shouldExplain: boolean,
  extras: Partial<
    Pick<MetacognitiveAssessment, "sandboxedCapabilityId" | "asyncEscalation">
  > = {},
): MetacognitiveAssessment {
  return {
    strategy,
    reason,
    confidenceInStrategy,
    cognitiveLoad,
    timeBudgetMs,
    shouldExplain,
    ...extras,
  };
}
