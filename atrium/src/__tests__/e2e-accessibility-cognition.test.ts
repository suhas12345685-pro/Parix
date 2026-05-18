import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { initDb, closeDb } from "../memory/db.js";
import {
  handleA11ySnapshot,
  getLatestAccessibility,
  _resetA11yState,
  type AccessibilitySnapshotMessage,
} from "../synapse/a11y-handler.js";
import { runCognition } from "../cognition/index.js";
import { clearFocus, resetStats } from "../cognition/attention.js";
import { inferDesire } from "../cognition/desire.js";
import type { WorkingMemory } from "../cognition/types.js";

function makeMsg(
  app: string,
  role: string,
  name: string,
  state: string[] = ["focused"],
): AccessibilitySnapshotMessage {
  return {
    type: "ACCESSIBILITY_SNAPSHOT",
    snapshot_id: `snap_${Math.random().toString(36).slice(2)}`,
    focused_app: app,
    backend_used: "uiautomation",
    tree_summary: {
      ts: Date.now() / 1000,
      backend_used: "uiautomation",
      focused_app: app,
      focused_element: {
        role,
        name,
        value: null,
        state,
        bounds: [0, 0, 200, 30],
        source: "accessibility",
      },
      confidence: 0.9,
    },
    confidence: 0.9,
    timestamp: Date.now() / 1000,
  };
}

describe("accessibility → cognition pipeline", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "parix-a11y-cog-"));
    await initDb(join(tmpDir, "memory.db"));
    _resetA11yState();
    clearFocus();
    resetStats();
  });

  afterEach(() => {
    closeDb();
    _resetA11yState();
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // best effort on Windows
    }
  });

  it("persists snapshots and exposes the latest one", () => {
    handleA11ySnapshot(makeMsg("Code", "text_field", "auth.py"));
    const latest = getLatestAccessibility();
    expect(latest).not.toBeNull();
    expect(latest!.focusedApp).toBe("Code");
    expect(latest!.focusedElement?.role).toBe("text_field");
    expect(latest!.focusedElement?.name).toBe("auth.py");
  });

  it("working memory picks up focused element on the next cognition cycle", () => {
    handleA11ySnapshot(makeMsg("Code", "text_field", "auth.py"));

    const snapshot = runCognition({
      type: "terminal_error",
      data: { output: "Error: MODULE_NOT_FOUND" },
      confidence: 0.92,
      timestamp: Date.now() / 1000,
    });

    expect(snapshot).not.toBeNull();
    if (!snapshot) return;

    expect(snapshot.workingMemory.focusedElement).not.toBeNull();
    expect(snapshot.workingMemory.focusedElement!.role).toBe("text_field");

    // The desire's evidence should cite the focused element.
    const evidenceJoined = snapshot.decision.desire.evidence.join("|");
    expect(evidenceJoined).toMatch(/focused:text_field/);
  });

  it("typing context raises the interruption floor (desire.interrupt softens)", () => {
    // Test inferDesire directly: an event that would normally cross the
    // 0.72 interrupt floor must NOT cross the 0.85 typing floor when the
    // focused element is a text field.
    const baseMem = (focused: WorkingMemory["focusedElement"]): WorkingMemory => ({
      currentGoal: "writing",
      activeApp: "Editor",
      activeProject: null,
      recentSignals: [],
      blockers: [],
      assumptions: [],
      uncertainty: 0.3,
      focusedElement: focused,
      updatedAt: Date.now(),
    });

    const event = {
      type: "terminal_error",
      data: { output: "warning: deprecated API" },
      confidence: 0.8,
      timestamp: Date.now() / 1000,
    };

    const withoutFocus = inferDesire(event, baseMem(null), [], []);
    const withTypingFocus = inferDesire(
      event,
      baseMem({
        role: "text_field",
        name: "draft.md",
        value: null,
        state: ["focused"],
        bounds: null,
      }),
      [],
      [],
    );

    // Both have similar confidence, but the typing context suppresses the
    // interrupt while the no-focus baseline lets it fire.
    expect(withoutFocus.interrupt).toBe(true);
    expect(withTypingFocus.interrupt).toBe(false);
  });

  it("dialog focus also raises the interruption floor", () => {
    handleA11ySnapshot(makeMsg("Installer", "dialog", "Confirm install?"));

    const snapshot = runCognition({
      type: "cpu_high",
      data: { pct: 81 },
      confidence: 0.8,
      timestamp: Date.now() / 1000,
    });
    expect(snapshot).not.toBeNull();
    if (!snapshot) return;
    expect(snapshot.decision.desire.interrupt).toBe(false);
    expect(snapshot.workingMemory.assumptions.some((a) => /dialog/i.test(a))).toBe(
      true,
    );
  });
});
