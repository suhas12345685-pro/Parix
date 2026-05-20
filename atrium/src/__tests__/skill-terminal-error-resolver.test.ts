import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolve } from "path";

import {
  loadSkills,
  matchSkills,
  getRegisteredSkill,
  _resetRegistry,
} from "../intelligence/skill-registry.js";
import { runSkill } from "../intelligence/skill-runner.js";
import { permittedPermissionsForSkill } from "../intelligence/skill-permissions.js";

const SKILLS_ROOT = resolve(__dirname, "../../../skills");
const SKILL_ID = "task-terminal-error-resolver";

beforeAll(() => {
  loadSkills(SKILLS_ROOT);
});

afterAll(() => {
  _resetRegistry();
});

describe("task-terminal-error-resolver end-to-end routing", () => {
  it("registry loads the skill from the canonical skills/ folder", () => {
    const reg = getRegisteredSkill(SKILL_ID);
    expect(reg).toBeDefined();
    expect(reg!.manifest.id).toBe(SKILL_ID);
    expect(reg!.manifest.runtime).toBe("py");
  });

  it("matchSkills picks up the skill for a high-confidence terminal_error event", () => {
    const matches = matchSkills({
      type: "terminal_error",
      data: { output: "npm ERR! Cannot find module 'foo'", matches: ["err:"] },
      confidence: 0.85,
    });
    expect(matches.some((m) => m.manifest.id === SKILL_ID)).toBe(true);
  });

  it("matchSkills excludes the skill below minConfidence", () => {
    const matches = matchSkills({
      type: "terminal_error",
      data: { output: "npm ERR! Cannot find module 'foo'" },
      confidence: 0.3,
    });
    expect(matches.some((m) => m.manifest.id === SKILL_ID)).toBe(false);
  });

  it("permission grant is registered (empty set is intentional)", () => {
    const grants = permittedPermissionsForSkill(SKILL_ID);
    expect(grants.size).toBe(0);
    // Manifest also declares no permissions — they must match.
    const reg = getRegisteredSkill(SKILL_ID);
    expect(reg!.manifest.permissions).toEqual([]);
  });

  it("runSkill produces a structured suggestion for an npm missing-module error", async () => {
    const reg = getRegisteredSkill(SKILL_ID);
    expect(reg).toBeDefined();
    const result = await runSkill({
      skillDir: reg!.skillDir,
      manifest: reg!.manifest,
      inputs: {
        output: "npm ERR! Cannot find module 'react'\nat Module._resolveFilename",
      },
      permittedPermissions: permittedPermissionsForSkill(SKILL_ID),
    });

    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();
    expect(result.output!.category).toBe("npm-missing-module");
    expect(typeof result.output!.suggestedFix).toBe("string");
    expect(result.output!.confidence).toBeGreaterThan(0.5);
    expect(result.output!.safeToAutoFix).toBe(false);
  });

  it("runSkill produces port-in-use suggestion for EADDRINUSE", async () => {
    const reg = getRegisteredSkill(SKILL_ID);
    const result = await runSkill({
      skillDir: reg!.skillDir,
      manifest: reg!.manifest,
      inputs: {
        output: "Error: listen EADDRINUSE: address already in use :::3000",
      },
    });
    expect(result.success).toBe(true);
    expect(result.output!.category).toBe("port-in-use");
  });

  it("runSkill falls back to generic for unrecognized errors", async () => {
    const reg = getRegisteredSkill(SKILL_ID);
    const result = await runSkill({
      skillDir: reg!.skillDir,
      manifest: reg!.manifest,
      inputs: { output: "something weird happened, no recognized signature" },
    });
    expect(result.success).toBe(true);
    expect(result.output!.category).toBe("generic");
  });
});
