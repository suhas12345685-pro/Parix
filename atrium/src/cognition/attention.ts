import type { CognitiveEvent, WorkingMemory } from "./types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AttentionState {
  focus: string | null;
  focusStrength: number;
  focusStartedAt: number;
  suppressedTypes: Set<string>;
  breakthrough: Set<string>;
  recentAdmissions: number;
  recentRejections: number;
}

export interface AttentionVerdict {
  admit: boolean;
  reason: string;
  adjustedConfidence: number;
  shouldShiftFocus: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BREAKTHROUGH_EVENTS = new Set([
  "battery_low",
  "battery_critical",
  "app_crash",
  "wifi_disconnected",
  "clipboard_sensitive_data",
  "disk_critical",
  "memory_critical",
]);

const BASE_THRESHOLD = 0.6;
const FOCUS_WEIGHT = 0.2;
const STRENGTH_GROWTH_PER_CYCLE = 0.03;
const STRENGTH_DECAY_PER_TICK = 0.015;
const NOVELTY_WINDOW = 10;
const MAX_SUPPRESS_DURATION_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const state: AttentionState = {
  focus: null,
  focusStrength: 0,
  focusStartedAt: 0,
  suppressedTypes: new Set(),
  breakthrough: new Set(BREAKTHROUGH_EVENTS),
  recentAdmissions: 0,
  recentRejections: 0,
};

const suppressTimers = new Map<string, number>();

// ---------------------------------------------------------------------------
// Core gate — should this event get cognitive processing?
// ---------------------------------------------------------------------------

export function gate(
  event: CognitiveEvent,
  workingMemory: WorkingMemory,
): AttentionVerdict {
  // Breakthrough events always pass
  if (state.breakthrough.has(event.type)) {
    const shouldShift = breakthroughShouldShift(event);
    state.recentAdmissions++;
    return {
      admit: true,
      reason: `breakthrough:${event.type}`,
      adjustedConfidence: Math.min(1, event.confidence * 1.1),
      shouldShiftFocus: shouldShift,
    };
  }

  // Suppressed events are dropped
  if (state.suppressedTypes.has(event.type)) {
    state.recentRejections++;
    return {
      admit: false,
      reason: `suppressed:${event.type}`,
      adjustedConfidence: event.confidence * 0.5,
      shouldShiftFocus: false,
    };
  }

  const relevance = relevanceToFocus(event, state.focus, workingMemory);
  const novelty = noveltyScore(event, workingMemory.recentSignals);
  const adjustedConfidence = event.confidence * (0.5 + 0.5 * relevance);
  const threshold = BASE_THRESHOLD + state.focusStrength * FOCUS_WEIGHT;

  // Highly relevant to current focus — always admit
  if (relevance >= 0.7) {
    strengthenFocus();
    state.recentAdmissions++;
    return {
      admit: true,
      reason: `relevant_to_focus(${relevance.toFixed(2)})`,
      adjustedConfidence,
      shouldShiftFocus: false,
    };
  }

  // Novel + high confidence — new important information
  if (novelty >= 0.8 && event.confidence >= 0.85) {
    state.recentAdmissions++;
    return {
      admit: true,
      reason: `novel_high_confidence(novelty=${novelty.toFixed(2)})`,
      adjustedConfidence,
      shouldShiftFocus: shouldShiftForNovelty(event, novelty),
    };
  }

  // Deep focus + irrelevant — reject
  if (state.focusStrength > 0.6 && relevance < 0.3) {
    state.recentRejections++;
    return {
      admit: false,
      reason: `deep_focus(strength=${state.focusStrength.toFixed(2)},relevance=${relevance.toFixed(2)})`,
      adjustedConfidence,
      shouldShiftFocus: false,
    };
  }

  // Default: threshold-based decision
  const admit = adjustedConfidence > threshold;
  if (admit) {
    state.recentAdmissions++;
  } else {
    state.recentRejections++;
  }

  return {
    admit,
    reason: admit
      ? `above_threshold(${adjustedConfidence.toFixed(2)}>${threshold.toFixed(2)})`
      : `below_threshold(${adjustedConfidence.toFixed(2)}<${threshold.toFixed(2)})`,
    adjustedConfidence,
    shouldShiftFocus: false,
  };
}

// ---------------------------------------------------------------------------
// Relevance scoring — how related is this event to the current focus?
// ---------------------------------------------------------------------------

function relevanceToFocus(
  event: CognitiveEvent,
  focus: string | null,
  workingMemory: WorkingMemory,
): number {
  if (!focus) return 0.5;

  let score = 0;

  // Type-based relevance: does the event type relate to the focus domain?
  const focusTokens = tokenize(focus);
  const typeTokens = tokenize(event.type);
  const typeOverlap = setOverlap(focusTokens, typeTokens);
  score += typeOverlap * 0.3;

  // Data-based relevance: do event data keys/values overlap with focus terms?
  const dataStr = JSON.stringify(event.data).toLowerCase();
  const focusTokenList = [...focusTokens];
  const focusHits = focusTokenList.filter((token) =>
    dataStr.includes(token),
  ).length;
  score += Math.min(
    0.4,
    (focusHits / Math.max(1, focusTokenList.length)) * 0.4,
  );

  // Goal alignment: is working memory's current goal similar to focus?
  if (workingMemory.currentGoal) {
    const goalTokens = tokenize(workingMemory.currentGoal);
    score += setOverlap(focusTokens, goalTokens) * 0.3;
  }

  return Math.min(1, score);
}

// ---------------------------------------------------------------------------
// Novelty — is this event genuinely new information?
// ---------------------------------------------------------------------------

function noveltyScore(
  event: CognitiveEvent,
  recentSignals: CognitiveEvent[],
): number {
  const recent = recentSignals.slice(0, NOVELTY_WINDOW);
  if (recent.length === 0) return 1;

  // How many recent events share this type?
  const sameType = recent.filter((s) => s.type === event.type).length;
  const typeNovelty = 1 - sameType / recent.length;

  // How different is the data from recent same-type events?
  const sameTypeEvents = recent.filter((s) => s.type === event.type);
  let dataNovelty = 1;
  if (sameTypeEvents.length > 0) {
    const currentKeys = new Set(Object.keys(event.data));
    const avgOverlap =
      sameTypeEvents.reduce((sum, prev) => {
        const prevKeys = new Set(Object.keys(prev.data));
        return sum + setOverlap(currentKeys, prevKeys);
      }, 0) / sameTypeEvents.length;
    dataNovelty = 1 - avgOverlap * 0.5;
  }

  return typeNovelty * 0.6 + dataNovelty * 0.4;
}

// ---------------------------------------------------------------------------
// Focus management
// ---------------------------------------------------------------------------

export function setFocus(goal: string): void {
  if (state.focus === goal) return;
  state.focus = goal;
  state.focusStrength = 0.3;
  state.focusStartedAt = Date.now();
}

export function strengthenFocus(): void {
  if (!state.focus) return;
  state.focusStrength = Math.min(
    1,
    state.focusStrength + STRENGTH_GROWTH_PER_CYCLE,
  );
}

export function decayFocus(): void {
  if (!state.focus) return;

  state.focusStrength = Math.max(
    0,
    state.focusStrength - STRENGTH_DECAY_PER_TICK,
  );

  if (state.focusStrength <= 0) {
    state.focus = null;
    state.focusStartedAt = 0;
  }
}

export function clearFocus(): void {
  state.focus = null;
  state.focusStrength = 0;
  state.focusStartedAt = 0;
}

// ---------------------------------------------------------------------------
// Suppression — temporarily ignore event types
// ---------------------------------------------------------------------------

export function suppress(
  eventType: string,
  durationMs: number = MAX_SUPPRESS_DURATION_MS,
): void {
  const clamped = Math.min(durationMs, MAX_SUPPRESS_DURATION_MS);
  state.suppressedTypes.add(eventType);
  suppressTimers.set(eventType, Date.now() + clamped);
}

export function unsuppress(eventType: string): void {
  state.suppressedTypes.delete(eventType);
  suppressTimers.delete(eventType);
}

export function cleanExpiredSuppressions(): void {
  const now = Date.now();
  for (const [type, expiresAt] of suppressTimers) {
    if (now >= expiresAt) {
      state.suppressedTypes.delete(type);
      suppressTimers.delete(type);
    }
  }
}

// ---------------------------------------------------------------------------
// Focus shift decisions
// ---------------------------------------------------------------------------

function breakthroughShouldShift(event: CognitiveEvent): boolean {
  if (!state.focus) return true;
  if (event.confidence >= 0.9) return true;
  if (state.focusStrength < 0.4) return true;
  return false;
}

function shouldShiftForNovelty(
  event: CognitiveEvent,
  novelty: number,
): boolean {
  if (!state.focus) return true;

  const inertia = focusInertia();
  return novelty * event.confidence > inertia;
}

function focusInertia(): number {
  if (!state.focus) return 0;

  const timeInFocusMs = Date.now() - state.focusStartedAt;
  const timeBonus = Math.min(0.2, (timeInFocusMs / (10 * 60 * 1000)) * 0.2);

  return state.focusStrength * 0.7 + timeBonus;
}

// ---------------------------------------------------------------------------
// State access
// ---------------------------------------------------------------------------

export function getAttentionState(): AttentionState {
  return { ...state };
}

export function getAttentionStats(): {
  focus: string | null;
  focusStrength: number;
  admitRate: number;
  suppressedCount: number;
} {
  const total = state.recentAdmissions + state.recentRejections;
  return {
    focus: state.focus,
    focusStrength: state.focusStrength,
    admitRate: total === 0 ? 1 : state.recentAdmissions / total,
    suppressedCount: state.suppressedTypes.size,
  };
}

export function resetStats(): void {
  state.recentAdmissions = 0;
  state.recentRejections = 0;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
