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
  recentTokenLoad: number;
  contextualLoad: "idle" | "normal" | "busy" | "saturated";
}

export interface AttentionVerdict {
  admit: boolean;
  reason: string;
  adjustedConfidence: number;
  shouldShiftFocus: boolean;
}

// ---------------------------------------------------------------------------
// Classification + token window
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

type EventClass = "breakthrough" | "interactive" | "diagnostic" | "ambient";
type ContextualLoad = AttentionState["contextualLoad"];

interface TokenWindowEntry {
  type: string;
  eventClass: EventClass;
  tokenCost: number;
  admitted: boolean;
  ts: number;
}

const TOKEN_WINDOW_SIZE = 48;
const CONTEXT_TOKEN_BUDGET = 2400;
const MAX_SUPPRESS_DURATION_MS = 5 * 60 * 1000;
const tokenWindow: TokenWindowEntry[] = [];

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
  recentTokenLoad: 0,
  contextualLoad: "idle",
};

const suppressTimers = new Map<string, number>();

// ---------------------------------------------------------------------------
// Core gate — should this event get cognitive processing?
// ---------------------------------------------------------------------------

export function gate(
  event: CognitiveEvent,
  workingMemory: WorkingMemory,
): AttentionVerdict {
  const eventClass = classifyEvent(event);
  const tokenCost = estimateTokenCost(event);
  const loadBefore = measureContextualLoad();

  // Breakthrough events always pass
  if (state.breakthrough.has(event.type)) {
    const shouldShift = breakthroughShouldShift(event);
    recordWindow(event, eventClass, tokenCost, true);
    return {
      admit: true,
      reason: `breakthrough:${event.type}`,
      adjustedConfidence: Math.min(1, event.confidence * 1.1),
      shouldShiftFocus: shouldShift,
    };
  }

  // Suppressed events are dropped
  if (state.suppressedTypes.has(event.type)) {
    recordWindow(event, eventClass, tokenCost, false);
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
  const barrier = classifyBarrier(eventClass, loadBefore, relevance);

  // Highly relevant to current focus — always admit
  if (relevance >= 0.7) {
    strengthenFocus();
    recordWindow(event, eventClass, tokenCost, true);
    return {
      admit: true,
      reason: `relevant_to_focus(${relevance.toFixed(2)})`,
      adjustedConfidence,
      shouldShiftFocus: false,
    };
  }

  // Novel + high confidence — new important information
  if (novelty >= 0.8 && event.confidence >= 0.85) {
    recordWindow(event, eventClass, tokenCost, true);
    return {
      admit: true,
      reason: `novel_high_confidence(novelty=${novelty.toFixed(2)})`,
      adjustedConfidence,
      shouldShiftFocus: shouldShiftForNovelty(event, novelty),
    };
  }

  // Deep focus + irrelevant — reject
  if (state.focusStrength > 0.6 && relevance < 0.3) {
    recordWindow(event, eventClass, tokenCost, false);
    return {
      admit: false,
      reason: `deep_focus(strength=${state.focusStrength.toFixed(2)},relevance=${relevance.toFixed(2)})`,
      adjustedConfidence,
      shouldShiftFocus: false,
    };
  }

  const admit = admitByBarrier(adjustedConfidence, barrier, tokenCost, loadBefore);
  recordWindow(event, eventClass, tokenCost, admit);

  return {
    admit,
    reason: admit
      ? `token_gate_pass(${eventClass},load=${loadBefore},confidence=${adjustedConfidence.toFixed(2)})`
      : `token_gate_hold(${eventClass},load=${loadBefore},confidence=${adjustedConfidence.toFixed(2)})`,
    adjustedConfidence,
    shouldShiftFocus: false,
  };
}

// ---------------------------------------------------------------------------
// Relevance scoring — how related is this event to the current focus?
// ---------------------------------------------------------------------------

function classifyEvent(event: CognitiveEvent): EventClass {
  if (state.breakthrough.has(event.type)) return "breakthrough";
  if (
    event.type.includes("error") ||
    event.type.includes("failed") ||
    event.type.includes("crash") ||
    event.type.includes("warning")
  ) {
    return "diagnostic";
  }
  if (
    event.type.includes("intent") ||
    event.type.includes("focus") ||
    event.type.includes("user")
  ) {
    return "interactive";
  }
  return "ambient";
}

function estimateTokenCost(event: CognitiveEvent): number {
  const serialized = JSON.stringify(event.data ?? {});
  return Math.max(8, Math.ceil((serialized.length + event.type.length) / 4));
}

function measureContextualLoad(): ContextualLoad {
  const recentTokenLoad = tokenWindow.reduce(
    (sum, entry) => sum + entry.tokenCost,
    0,
  );
  state.recentTokenLoad = recentTokenLoad;

  const rejected = tokenWindow.filter((entry) => !entry.admitted).length;
  const rejectionPressure =
    tokenWindow.length === 0 ? 0 : rejected / tokenWindow.length;
  const budgetPressure = recentTokenLoad / CONTEXT_TOKEN_BUDGET;

  if (budgetPressure > 0.9 || rejectionPressure > 0.55) {
    state.contextualLoad = "saturated";
  } else if (budgetPressure > 0.65 || rejectionPressure > 0.35) {
    state.contextualLoad = "busy";
  } else if (
    budgetPressure > 0.25 ||
    tokenWindow.length > TOKEN_WINDOW_SIZE / 3
  ) {
    state.contextualLoad = "normal";
  } else {
    state.contextualLoad = "idle";
  }

  return state.contextualLoad;
}

function classifyBarrier(
  eventClass: EventClass,
  load: ContextualLoad,
  relevance: number,
): "open" | "standard" | "narrow" | "defer" {
  if (eventClass === "breakthrough") return "open";
  if (eventClass === "interactive" && load !== "saturated") return "open";
  if (eventClass === "diagnostic" && relevance >= 0.4) return "open";
  if (load === "idle") return "standard";
  if (load === "normal") return eventClass === "ambient" ? "narrow" : "standard";
  if (load === "busy") return eventClass === "ambient" ? "defer" : "narrow";
  return eventClass === "diagnostic" ? "narrow" : "defer";
}

function admitByBarrier(
  adjustedConfidence: number,
  barrier: "open" | "standard" | "narrow" | "defer",
  tokenCost: number,
  load: ContextualLoad,
): boolean {
  if (barrier === "open") return true;
  if (barrier === "defer") return false;

  const budgetHeadroom = Math.max(
    0,
    CONTEXT_TOKEN_BUDGET - state.recentTokenLoad - tokenCost,
  );
  const headroomRatio = budgetHeadroom / CONTEXT_TOKEN_BUDGET;
  const floor =
    barrier === "standard"
      ? load === "idle"
        ? 0.55
        : 0.62
      : load === "busy" || load === "saturated"
        ? 0.78
        : 0.7;

  return adjustedConfidence >= floor && headroomRatio > 0.08;
}

function recordWindow(
  event: CognitiveEvent,
  eventClass: EventClass,
  tokenCost: number,
  admitted: boolean,
): void {
  tokenWindow.push({
    type: event.type,
    eventClass,
    tokenCost,
    admitted,
    ts: event.timestamp,
  });
  while (tokenWindow.length > TOKEN_WINDOW_SIZE) {
    tokenWindow.shift();
  }

  if (admitted) {
    state.recentAdmissions++;
  } else {
    state.recentRejections++;
  }
  measureContextualLoad();
}

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
  const recent = recentSignals.slice(0, Math.min(TOKEN_WINDOW_SIZE, recentSignals.length));
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
  const focusTokens = tokenize(state.focus);
  const focusMatches = tokenWindow.filter((entry) =>
    focusTokens.has(entry.type),
  ).length;
  const observedLoad = measureContextualLoad();
  const increment =
    observedLoad === "saturated" ? 1 / TOKEN_WINDOW_SIZE : 1.5 / TOKEN_WINDOW_SIZE;
  state.focusStrength = Math.min(
    1,
    state.focusStrength + increment + focusMatches / (TOKEN_WINDOW_SIZE * 8),
  );
}

export function decayFocus(): void {
  if (!state.focus) return;

  const load = measureContextualLoad();
  const decrement = load === "idle" ? 2 / TOKEN_WINDOW_SIZE : 1 / TOKEN_WINDOW_SIZE;
  state.focusStrength = Math.max(0, state.focusStrength - decrement);

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
  recentTokenLoad: number;
  contextualLoad: ContextualLoad;
} {
  measureContextualLoad();
  const total = state.recentAdmissions + state.recentRejections;
  return {
    focus: state.focus,
    focusStrength: state.focusStrength,
    admitRate: total === 0 ? 1 : state.recentAdmissions / total,
    suppressedCount: state.suppressedTypes.size,
    recentTokenLoad: state.recentTokenLoad,
    contextualLoad: state.contextualLoad,
  };
}

export function resetStats(): void {
  state.recentAdmissions = 0;
  state.recentRejections = 0;
  tokenWindow.splice(0, tokenWindow.length);
  state.recentTokenLoad = 0;
  state.contextualLoad = "idle";
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
