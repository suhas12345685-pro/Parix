import { v4 as uuid } from "uuid";
import type { CandidateAction } from "./types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NarrativeAttempt {
  approach: string;
  outcome: "success" | "failure" | "partial" | "abandoned";
  timestamp: number;
  lessonLearned?: string;
}

export interface Narrative {
  id: string;
  goal: string;
  summary: string;
  trigger: string;
  startedAt: number;
  lastActivityAt: number;
  attempts: NarrativeAttempt[];
  status: "active" | "succeeded" | "abandoned" | "blocked";
  blockedReason?: string;
}

export interface CoherenceCheck {
  isCoherent: boolean;
  activeNarratives: Narrative[];
  conflicts: string[];
  suggestions: string[];
  reinforces: string[];
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const narratives = new Map<string, Narrative>();
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24h
const MAX_ATTEMPTS_PER_NARRATIVE = 20;
const SIMILARITY_THRESHOLD = 0.4;

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export function startNarrative(goal: string, trigger: string): Narrative {
  // Check if a similar narrative already exists
  const existing = findRelevantNarrative(goal);
  if (existing && existing.status === "active") {
    existing.lastActivityAt = Date.now();
    return existing;
  }

  const narrative: Narrative = {
    id: uuid(),
    goal,
    summary: `Started: ${goal}`,
    trigger,
    startedAt: Date.now(),
    lastActivityAt: Date.now(),
    attempts: [],
    status: "active",
  };

  narratives.set(narrative.id, narrative);
  return narrative;
}

export function recordAttempt(
  narrativeId: string,
  attempt: NarrativeAttempt,
): void {
  const narrative = narratives.get(narrativeId);
  if (!narrative) return;

  narrative.attempts.push(attempt);
  narrative.lastActivityAt = Date.now();

  // Keep bounded
  if (narrative.attempts.length > MAX_ATTEMPTS_PER_NARRATIVE) {
    narrative.attempts = narrative.attempts.slice(-MAX_ATTEMPTS_PER_NARRATIVE);
  }

  // Auto-resolve on success
  if (attempt.outcome === "success") {
    narrative.status = "succeeded";
    narrative.summary = buildSummary(narrative);
  }

  // Mark blocked after repeated failures
  const recentFailures = narrative.attempts
    .slice(-3)
    .filter((a) => a.outcome === "failure");
  if (recentFailures.length >= 3) {
    narrative.status = "blocked";
    narrative.blockedReason = `Failed ${recentFailures.length} consecutive times. Last: ${recentFailures[recentFailures.length - 1]?.lessonLearned ?? "unknown"}`;
  }
}

export function resolveNarrative(
  narrativeId: string,
  status: Narrative["status"],
): void {
  const narrative = narratives.get(narrativeId);
  if (!narrative) return;

  narrative.status = status;
  narrative.lastActivityAt = Date.now();
  narrative.summary = buildSummary(narrative);
}

// ---------------------------------------------------------------------------
// Coherence checking — call before executing any plan
// ---------------------------------------------------------------------------

export function checkCoherence(
  proposedAction: CandidateAction,
  active?: Narrative[],
): CoherenceCheck {
  const activeNarratives = active ?? getActiveNarratives();
  const conflicts: string[] = [];
  const suggestions: string[] = [];
  const reinforces: string[] = [];

  const actionGoal = String(
    proposedAction.payload.goal ??
      proposedAction.payload.action ??
      proposedAction.reason ??
      "",
  );
  const actionApproach = `${proposedAction.taskType}:${actionGoal}`;

  for (const narrative of activeNarratives) {
    // Check for conflicts — does this action undo progress?
    if (detectConflict(proposedAction, narrative)) {
      conflicts.push(
        `Action "${actionGoal}" may conflict with active narrative "${narrative.goal}"`,
      );
    }

    // Check for reinforcement — does this advance a narrative?
    if (detectReinforcement(proposedAction, narrative)) {
      reinforces.push(`Advances narrative: "${narrative.goal}"`);
    }

    // Check anti-repetition — has this been tried before?
    const priorAttempt = hasBeenTried(actionApproach, narrative.goal);
    if (priorAttempt && priorAttempt.outcome === "failure") {
      suggestions.push(
        `Previously tried "${priorAttempt.approach}" for "${narrative.goal}" and it failed` +
          (priorAttempt.lessonLearned
            ? `. Lesson: ${priorAttempt.lessonLearned}`
            : ""),
      );
    }
  }

  return {
    isCoherent: conflicts.length === 0,
    activeNarratives,
    conflicts,
    suggestions,
    reinforces,
  };
}

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------

function detectConflict(
  action: CandidateAction,
  narrative: Narrative,
): boolean {
  const actionStr = JSON.stringify(action.payload).toLowerCase();
  const goalTokens = tokenize(narrative.goal);

  // Destructive actions against narrative entities
  const destructiveTypes = [
    "delete",
    "remove",
    "kill",
    "stop",
    "disable",
    "drop",
  ];
  const isDestructive = destructiveTypes.some((d) => actionStr.includes(d));

  if (!isDestructive) return false;

  // Does the destruction target something the narrative cares about?
  const actionTokens = tokenize(actionStr);
  const overlap = setOverlap(goalTokens, actionTokens);

  return overlap > SIMILARITY_THRESHOLD;
}

// ---------------------------------------------------------------------------
// Reinforcement detection
// ---------------------------------------------------------------------------

function detectReinforcement(
  action: CandidateAction,
  narrative: Narrative,
): boolean {
  const actionGoal = String(
    action.payload.goal ?? action.payload.action ?? action.reason ?? "",
  );
  const similarity = stringSimilarity(actionGoal, narrative.goal);

  return similarity > 0.5;
}

// ---------------------------------------------------------------------------
// Anti-repetition — "we tried this before"
// ---------------------------------------------------------------------------

export function hasBeenTried(
  approach: string,
  goal: string,
): NarrativeAttempt | null {
  const relevantNarrative = findRelevantNarrative(goal);
  if (!relevantNarrative) return null;

  const approachTokens = tokenize(approach);

  for (const attempt of relevantNarrative.attempts) {
    const attemptTokens = tokenize(attempt.approach);
    const similarity = setOverlap(approachTokens, attemptTokens);

    if (similarity > SIMILARITY_THRESHOLD) {
      return attempt;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Recall
// ---------------------------------------------------------------------------

export function getActiveNarratives(): Narrative[] {
  return [...narratives.values()].filter((n) => n.status === "active");
}

export function getAllNarratives(): Narrative[] {
  return [...narratives.values()];
}

export function findRelevantNarrative(goal: string): Narrative | null {
  const goalTokens = tokenize(goal);
  let best: Narrative | null = null;
  let bestScore = 0;

  for (const narrative of narratives.values()) {
    if (narrative.status === "succeeded" || narrative.status === "abandoned")
      continue;

    const narrativeTokens = tokenize(narrative.goal);
    const score = setOverlap(goalTokens, narrativeTokens);

    if (score > bestScore && score > SIMILARITY_THRESHOLD) {
      best = narrative;
      bestScore = score;
    }
  }

  return best;
}

export function getStaleNarratives(): Narrative[] {
  const now = Date.now();
  return [...narratives.values()].filter(
    (n) => n.status === "active" && now - n.lastActivityAt > STALE_THRESHOLD_MS,
  );
}

// ---------------------------------------------------------------------------
// Session continuity — called on startup
// ---------------------------------------------------------------------------

export function resumeNarratives(storedNarratives: Narrative[]): Narrative[] {
  for (const narrative of storedNarratives) {
    narratives.set(narrative.id, narrative);
  }

  const stale = getStaleNarratives();
  const active = getActiveNarratives();

  return [...active, ...stale];
}

export function loadFromDb(
  rows: Array<{
    id: string;
    goal: string;
    summary: string;
    trigger: string;
    status: string;
    blocked_reason: string | null;
    started_at: string;
    last_activity_at: string;
    attempts_json: string;
  }>,
): void {
  for (const row of rows) {
    const narrative: Narrative = {
      id: row.id,
      goal: row.goal,
      summary: row.summary,
      trigger: row.trigger,
      startedAt: new Date(row.started_at).getTime(),
      lastActivityAt: new Date(row.last_activity_at).getTime(),
      attempts: safeParse(row.attempts_json) ?? [],
      status: row.status as Narrative["status"],
      blockedReason: row.blocked_reason ?? undefined,
    };
    narratives.set(narrative.id, narrative);
  }
}

// ---------------------------------------------------------------------------
// Serialization — for persistence by store layer
// ---------------------------------------------------------------------------

export function serializeForDb(narrative: Narrative): {
  id: string;
  goal: string;
  summary: string;
  trigger: string;
  status: string;
  blocked_reason: string | null;
  started_at: string;
  last_activity_at: string;
  attempts_json: string;
} {
  return {
    id: narrative.id,
    goal: narrative.goal,
    summary: narrative.summary,
    trigger: narrative.trigger,
    status: narrative.status,
    blocked_reason: narrative.blockedReason ?? null,
    started_at: new Date(narrative.startedAt).toISOString(),
    last_activity_at: new Date(narrative.lastActivityAt).toISOString(),
    attempts_json: JSON.stringify(narrative.attempts),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSummary(narrative: Narrative): string {
  const parts: string[] = [`Goal: ${narrative.goal}`];

  const successes = narrative.attempts.filter(
    (a) => a.outcome === "success",
  ).length;
  const failures = narrative.attempts.filter(
    (a) => a.outcome === "failure",
  ).length;

  if (narrative.attempts.length > 0) {
    parts.push(
      `Attempts: ${narrative.attempts.length} (${successes} ok, ${failures} failed)`,
    );
  }

  const lessons = narrative.attempts
    .filter((a) => a.lessonLearned)
    .map((a) => a.lessonLearned!)
    .slice(-3);

  if (lessons.length > 0) {
    parts.push(`Lessons: ${lessons.join("; ")}`);
  }

  return parts.join(" | ");
}

function tokenize(str: string): Set<string> {
  return new Set(
    str
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

function setOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let hits = 0;
  for (const item of a) {
    if (b.has(item)) hits++;
  }
  return hits / Math.max(a.size, b.size);
}

function stringSimilarity(a: string, b: string): number {
  return setOverlap(tokenize(a), tokenize(b));
}

function safeParse(str: string): any {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}
