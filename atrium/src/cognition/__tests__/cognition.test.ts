import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { initDb, closeDb } from "../../memory/db.js";
import { runCognition } from "../index.js";
import { inferDesire } from "../desire.js";
import type { WorkingMemory } from "../types.js";
import {
  loadSkills,
  _resetRegistry,
} from "../../intelligence/skill-registry.js";
import type { SkillManifest } from "../../../../shared/types/skill.js";

function writeMatcherSkill(
  skillsRoot: string,
  id: string,
  eventType: string,
): void {
  const skillDir = join(skillsRoot, id);
  mkdirSync(join(skillDir, "scripts"), { recursive: true });
  const entry = join(skillDir, "scripts/noop.cjs");
  writeFileSync(entry, "process.stdout.write('{}');\n", "utf-8");
  chmodSync(entry, 0o755);

  const manifest: SkillManifest = {
    id,
    version: "1.0",
    enabled: true,
    triggers: [{ eventType, minConfidence: 0, platforms: ["any"] }],
    entry: "scripts/noop.cjs",
    runtime: "node",
    inputs: [],
    outputs: [],
    reversibility: 0.85,
    permissions: [],
    timeoutMs: 5000,
  };
  writeFileSync(
    join(skillDir, "config.json"),
    JSON.stringify(manifest, null, 2),
    "utf-8",
  );
  writeFileSync(join(skillDir, "SKILL.md"), `# ${id}\n`, "utf-8");
}

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

  describe("decision.toolCalls — cognition emits matched skills as tool calls", () => {
    let skillsRoot: string;

    beforeEach(() => {
      _resetRegistry();
      skillsRoot = mkdtempSync(join(tmpdir(), "parix-cog-skills-"));
    });

    afterEach(() => {
      rmSync(skillsRoot, { recursive: true, force: true });
      _resetRegistry();
    });

    it("emits empty toolCalls when no skills match the event", () => {
      // No skills registered.
      const snapshot = runCognition({
        type: "no_matching_skill_event",
        data: {},
        confidence: 0.9,
        timestamp: Date.now() / 1000,
      });

      expect(snapshot).not.toBeNull();
      expect(snapshot!.decision.toolCalls).toEqual([]);
    });

    it("emits one toolCall per matched skill (multi-skill fan-out)", () => {
      writeMatcherSkill(skillsRoot, "task-skill-a", "fanout_cog_event");
      writeMatcherSkill(skillsRoot, "task-skill-b", "fanout_cog_event");
      writeMatcherSkill(skillsRoot, "task-skill-c", "fanout_cog_event");
      loadSkills(skillsRoot);

      const snapshot = runCognition({
        type: "fanout_cog_event",
        data: { foo: "bar" },
        confidence: 0.95,
        timestamp: Date.now() / 1000,
      });

      expect(snapshot).not.toBeNull();
      const ids = snapshot!.decision.toolCalls.map((t) => t.skillId).sort();
      expect(ids).toEqual(["task-skill-a", "task-skill-b", "task-skill-c"]);

      // Inputs mirror the event data so council can fan out without
      // re-deriving them.
      for (const call of snapshot!.decision.toolCalls) {
        expect(call.inputs).toEqual({ foo: "bar" });
        expect(call.reversibility).toBeCloseTo(0.85, 5);
      }
    });
  });
});
