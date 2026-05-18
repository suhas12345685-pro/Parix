import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { initDb, closeDb } from "../../memory/db.js";
import { runCognition } from "../index.js";
import { inferDesire } from "../desire.js";
import type { WorkingMemory } from "../types.js";

describe("cognition layer", () => {
  beforeEach(async () => {
    const dir = mkdtempSync(join(tmpdir(), "parix-cognition-"));
    await initDb(join(dir, "memory.db"));
  });

  afterEach(() => {
    closeDb();
  });

  it("infers developer intent from terminal errors", () => {
    const snapshot = runCognition({
      type: "terminal_error",
      data: {
        output: "Error: MODULE_NOT_FOUND",
        cwd: "C:/work/app",
      },
      confidence: 0.91,
      timestamp: Date.now() / 1000,
    });

    expect(snapshot).not.toBeNull();
    if (!snapshot) return;

    expect(snapshot.decision.desire.inferredGoal).toContain("debugging");
    expect(snapshot.decision.hypotheses[0].explanation).toContain("dependency");
    expect(
      snapshot.preferences.some((pref) => pref.key === "developer_workflow"),
    ).toBe(true);
    expect(
      snapshot.worldFacts.some((fact) => fact.key === "active_project"),
    ).toBe(true);
  });

  it("prefers silent preparation when interruption confidence is lower", () => {
    const memory: WorkingMemory = {
      currentGoal: "continuing current work",
      activeApp: null,
      activeProject: null,
      recentSignals: [],
      blockers: [],
      assumptions: [],
      uncertainty: 0.6,
      focusedElement: null,
      updatedAt: Date.now(),
    };

    const desire = inferDesire(
      {
        type: "unknown_low_signal",
        data: {},
        confidence: 0.5,
        timestamp: Date.now() / 1000,
      },
      memory,
      [],
      [],
    );

    expect(desire.interrupt).toBe(false);
    expect(desire.silentPrep.length).toBeGreaterThan(0);
  });
});
