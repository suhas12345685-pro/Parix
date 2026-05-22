import { afterEach, describe, expect, it } from "vitest";
import {
  clearFocus,
  decayFocus,
  gate,
  getAttentionState,
  getAttentionStats,
  resetStats,
  setFocus,
  strengthenFocus,
  suppress,
  unsuppress,
} from "../attention.js";
import type { CognitiveEvent, WorkingMemory } from "../types.js";

const suppressedTypes = new Set<string>();

describe("attention gate", () => {
  afterEach(() => {
    clearFocus();
    resetStats();
    for (const type of suppressedTypes) {
      unsuppress(type);
    }
    suppressedTypes.clear();
  });

  it("breakthrough events are always admitted", () => {
    setFocus("writing release notes");
    for (let i = 0; i < 25; i++) strengthenFocus();

    const verdict = gate(
      makeEvent("battery_critical", { pct: 3 }, 0.55),
      makeMemory({
        recentSignals: repeatEvents("cpu_high", 10),
        currentGoal: "writing release notes",
      }),
    );

    expect(verdict.admit).toBe(true);
    expect(verdict.reason).toBe("breakthrough:battery_critical");
    expect(verdict.adjustedConfidence).toBeCloseTo(0.605);
  });

  it("suppressed events are always rejected", () => {
    suppressedTypes.add("cpu_high");
    suppress("cpu_high", 60_000);

    const verdict = gate(
      makeEvent("cpu_high", { pct: 99 }, 0.99),
      makeMemory(),
    );

    expect(verdict).toMatchObject({
      admit: false,
      reason: "suppressed:cpu_high",
      shouldShiftFocus: false,
    });
    expect(verdict.adjustedConfidence).toBeCloseTo(0.495);
  });

  it("relevant events are admitted during focus", () => {
    setFocus("debugging missing module");
    const before = getAttentionState().focusStrength;

    const verdict = gate(
      makeEvent(
        "terminal_error",
        { output: "debugging failed because missing module cannot resolve" },
        0.35,
      ),
      makeMemory({ currentGoal: "debugging missing module" }),
    );

    expect(verdict.admit).toBe(true);
    expect(verdict.reason).toContain("relevant_to_focus");
    expect(getAttentionState().focusStrength).toBeGreaterThan(before);
  });

  it("irrelevant events are rejected during deep focus", () => {
    setFocus("writing quarterly review");
    for (let i = 0; i < 30; i++) strengthenFocus();

    const verdict = gate(
      makeEvent("cpu_high", { pct: 82, process: "browser" }, 0.95),
      makeMemory({
        currentGoal: null,
        recentSignals: repeatEvents("cpu_high", 10),
      }),
    );

    expect(verdict.admit).toBe(false);
    expect(verdict.reason).toContain("deep_focus");
  });

  it("novel events break through with high confidence", () => {
    setFocus("writing quarterly review");
    for (let i = 0; i < 30; i++) strengthenFocus();

    const verdict = gate(
      makeEvent(
        "rare_backup_warning",
        { volume: "project-drive", status: "stalled" },
        0.9,
      ),
      makeMemory({
        currentGoal: "writing quarterly review",
        recentSignals: repeatEvents("cpu_high", 10),
      }),
    );

    expect(verdict.admit).toBe(true);
    expect(verdict.reason).toContain("novel_high_confidence");
    expect(verdict.shouldShiftFocus).toBe(true);
  });

  it("focus decays over time", () => {
    setFocus("debugging missing module");
    const initial = getAttentionState().focusStrength;

    decayFocus();
    expect(getAttentionState().focusStrength).toBeLessThan(initial);

    for (let i = 0; i < 30; i++) decayFocus();
    expect(getAttentionState().focus).toBeNull();
    expect(getAttentionState().focusStrength).toBe(0);
  });

  it("focus strengthens on relevant admissions", () => {
    setFocus("debugging missing module");
    const before = getAttentionState().focusStrength;

    gate(
      makeEvent(
        "terminal_error",
        { output: "missing module while debugging" },
        0.4,
      ),
      makeMemory({ currentGoal: "debugging missing module" }),
    );

    expect(getAttentionState().focusStrength).toBeGreaterThan(before);
  });

  it("tracks contextual token load in a sliding window", () => {
    for (let i = 0; i < 8; i++) {
      gate(
        makeEvent("build_log_line", { output: "x".repeat(200 + i) }, 0.7),
        makeMemory(),
      );
    }

    const stats = getAttentionStats();
    expect(stats.recentTokenLoad).toBeGreaterThan(0);
    expect(["idle", "normal", "busy", "saturated"]).toContain(
      stats.contextualLoad,
    );
  });
});

function makeEvent(
  type: string,
  data: Record<string, unknown> = {},
  confidence = 0.8,
): CognitiveEvent {
  return {
    type,
    data,
    confidence,
    timestamp: Date.now() / 1000,
  };
}

function makeMemory(overrides: Partial<WorkingMemory> = {}): WorkingMemory {
  return {
    currentGoal: null,
    activeApp: null,
    activeProject: null,
    recentSignals: [],
    blockers: [],
    assumptions: [],
    uncertainty: 0.5,
    focusedElement: null,
    updatedAt: Date.now(),
    ...overrides,
  };
}

function repeatEvents(type: string, count: number): CognitiveEvent[] {
  return Array.from({ length: count }, (_, index) =>
    makeEvent(type, { pct: 70 + index, process: "browser" }, 0.8),
  );
}
