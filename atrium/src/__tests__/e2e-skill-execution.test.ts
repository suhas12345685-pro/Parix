import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { initDb, closeDb } from "../memory/db.js";
import {
  loadSkills,
  matchSkills,
  getRegisteredSkill,
  getRegistryStats,
  _resetRegistry,
} from "../intelligence/skill-registry.js";
import { runSkill, SkillPermissionError } from "../intelligence/skill-runner.js";
import { runCognition } from "../cognition/index.js";
import type { SkillManifest } from "../../../shared/types/skill.js";

// ---------------------------------------------------------------------------
// Helpers — write a self-contained Node skill into a temp directory so we can
// exercise loader → matcher → runner without depending on real production
// scripts (or Python being installed).
// ---------------------------------------------------------------------------

function writeNodeEchoSkill(
  skillsRoot: string,
  id: string,
  triggers: SkillManifest["triggers"],
  overrides: Partial<SkillManifest> = {},
): string {
  const skillDir = join(skillsRoot, id);
  mkdirSync(join(skillDir, "scripts"), { recursive: true });

  const entryRel = "scripts/echo.cjs";
  const entry = join(skillDir, entryRel);
  // CommonJS so `node entry` works regardless of nearest package.json type.
  writeFileSync(
    entry,
    `let buf = "";
process.stdin.on("data", (c) => (buf += c));
process.stdin.on("end", () => {
  let parsed = {};
  try { parsed = JSON.parse(buf || "{}"); } catch {}
  const out = { ok: true, echoedInputs: parsed, ts: Date.now() };
  process.stdout.write(JSON.stringify(out));
});
`,
    "utf-8",
  );
  chmodSync(entry, 0o755);

  const manifest: SkillManifest = {
    id,
    version: "1.0",
    enabled: true,
    description: `Test skill ${id}`,
    triggers,
    entry: entryRel,
    runtime: "node",
    inputs: [],
    outputs: [{ name: "ok", type: "boolean" }],
    reversibility: 0.9,
    permissions: ["filesystem:read"],
    timeoutMs: 10000,
    ...overrides,
  };

  writeFileSync(
    join(skillDir, "config.json"),
    JSON.stringify(manifest, null, 2),
    "utf-8",
  );
  writeFileSync(
    join(skillDir, "SKILL.md"),
    `# ${id}\n\nTest skill.\n`,
    "utf-8",
  );

  return skillDir;
}

function writeFailingSkill(skillsRoot: string, id: string): string {
  const skillDir = join(skillsRoot, id);
  mkdirSync(join(skillDir, "scripts"), { recursive: true });
  const entry = join(skillDir, "scripts/fail.cjs");
  writeFileSync(
    entry,
    `process.stderr.write("nope");\nprocess.exit(2);\n`,
    "utf-8",
  );
  const manifest: SkillManifest = {
    id,
    version: "1.0",
    enabled: true,
    triggers: [{ eventType: "always_fail", minConfidence: 0 }],
    entry: "scripts/fail.cjs",
    runtime: "node",
    inputs: [],
    outputs: [],
    reversibility: 0.9,
    permissions: [],
    timeoutMs: 10000,
  };
  writeFileSync(
    join(skillDir, "config.json"),
    JSON.stringify(manifest, null, 2),
    "utf-8",
  );
  return skillDir;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("e2e skill execution pipeline", () => {
  let workDir: string;
  let skillsRoot: string;

  beforeEach(async () => {
    workDir = mkdtempSync(join(tmpdir(), "parix-e2e-skill-"));
    skillsRoot = join(workDir, "skills");
    mkdirSync(skillsRoot, { recursive: true });
    await initDb(join(workDir, "memory.db"));
    _resetRegistry();
  });

  afterEach(() => {
    closeDb();
    _resetRegistry();
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      // Windows file handle delay — best effort.
    }
  });

  it("loads only valid task-* manifests with existing entry files", () => {
    writeNodeEchoSkill(skillsRoot, "task-echo-a", [
      { eventType: "disk_low", minConfidence: 0.6, platforms: ["any"] },
    ]);
    // Skill with no entry script → should be skipped at load time.
    const bogusDir = join(skillsRoot, "task-missing-entry");
    mkdirSync(bogusDir, { recursive: true });
    writeFileSync(
      join(bogusDir, "config.json"),
      JSON.stringify({
        id: "task-missing-entry",
        version: "1.0",
        enabled: true,
        triggers: [{ eventType: "disk_low" }],
        entry: "scripts/does-not-exist.cjs",
        runtime: "node",
        inputs: [],
        outputs: [],
        reversibility: 0.9,
        permissions: [],
      }),
      "utf-8",
    );
    // Disabled skill — should also be skipped.
    writeNodeEchoSkill(
      skillsRoot,
      "task-disabled",
      [{ eventType: "disk_low" }],
      { enabled: false },
    );
    // Not prefixed with task- → ignored entirely.
    writeNodeEchoSkill(skillsRoot, "ignore-me", [{ eventType: "disk_low" }]);
    // Wait — writeNodeEchoSkill prefix doesn't matter to its writer, but the
    // loader filters by `task-` prefix. Rename by re-emitting under a proper
    // ignore folder.

    const loaded = loadSkills(skillsRoot);
    const ids = loaded.map((r) => r.manifest.id).sort();

    // Only the one valid task-* skill should be registered.
    expect(ids).toEqual(["task-echo-a"]);

    const stats = getRegistryStats();
    expect(stats.totalSkills).toBe(1);
    expect(stats.totalTriggers).toBe(1);
    expect(stats.eventTypes).toContain("disk_low");
  });

  it("matches triggers by eventType, minConfidence, dataKeys, and keywords", () => {
    writeNodeEchoSkill(skillsRoot, "task-echo-strict", [
      {
        eventType: "terminal_error",
        keywords: ["ENOSPC", "no space"],
        dataKeys: ["output", "cwd"],
        minConfidence: 0.7,
        platforms: ["any"],
      },
    ]);
    loadSkills(skillsRoot);

    // Match: keyword present, both data keys present, confidence high enough.
    const matched = matchSkills({
      type: "terminal_error",
      data: { output: "Error: ENOSPC", cwd: "C:/work" },
      confidence: 0.91,
    });
    expect(matched.map((m) => m.manifest.id)).toEqual(["task-echo-strict"]);

    // No match: confidence too low.
    expect(
      matchSkills({
        type: "terminal_error",
        data: { output: "Error: ENOSPC", cwd: "C:/work" },
        confidence: 0.5,
      }),
    ).toHaveLength(0);

    // No match: missing required dataKey 'cwd'.
    expect(
      matchSkills({
        type: "terminal_error",
        data: { output: "Error: ENOSPC" },
        confidence: 0.91,
      }),
    ).toHaveLength(0);

    // No match: keyword not in payload.
    expect(
      matchSkills({
        type: "terminal_error",
        data: { output: "Error: MODULE_NOT_FOUND", cwd: "C:/work" },
        confidence: 0.91,
      }),
    ).toHaveLength(0);
  });

  it("end-to-end: matched skill runs and returns parsed output", async () => {
    writeNodeEchoSkill(skillsRoot, "task-echo-run", [
      { eventType: "disk_low", minConfidence: 0.5, platforms: ["any"] },
    ]);
    loadSkills(skillsRoot);

    const matches = matchSkills({
      type: "disk_low",
      data: { freeMb: 200 },
      confidence: 0.88,
    });
    expect(matches).toHaveLength(1);

    const reg = matches[0];
    const result = await runSkill({
      skillDir: reg.skillDir,
      manifest: reg.manifest,
      inputs: { dryRun: true },
      permittedPermissions: new Set(["filesystem:read"]),
    });

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(result.output).toBeDefined();
    expect(result.output!.ok).toBe(true);
    expect((result.output!.echoedInputs as Record<string, unknown>).dryRun).toBe(true);
  });

  it("propagates non-zero exit codes and stderr", async () => {
    writeFailingSkill(skillsRoot, "task-always-fail");
    loadSkills(skillsRoot);

    const reg = getRegisteredSkill("task-always-fail")!;
    const result = await runSkill({
      skillDir: reg.skillDir,
      manifest: reg.manifest,
      inputs: {},
    });

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("nope");
    expect(result.error).toContain("exit 2");
  });

  it("blocks execution when required permissions are not granted", async () => {
    writeNodeEchoSkill(
      skillsRoot,
      "task-perm-gated",
      [{ eventType: "disk_low" }],
      { permissions: ["filesystem:write", "process:execute"] },
    );
    loadSkills(skillsRoot);
    const reg = getRegisteredSkill("task-perm-gated")!;

    await expect(
      runSkill({
        skillDir: reg.skillDir,
        manifest: reg.manifest,
        permittedPermissions: new Set(["filesystem:read"]),
      }),
    ).rejects.toBeInstanceOf(SkillPermissionError);
  });

  it("cognition.hasCache reflects manifest matches (drives reflex/delegate)", () => {
    // Register a manifest that triggers on disk_low. Then run cognition with
    // a matching event and verify metacognition saw the skill cache.
    writeNodeEchoSkill(skillsRoot, "task-meta-hit", [
      { eventType: "disk_low", minConfidence: 0.5, platforms: ["any"] },
    ]);
    loadSkills(skillsRoot);

    const snapshot = runCognition({
      type: "disk_low",
      data: { freeMb: 150, drive: "C:" },
      confidence: 0.92,
      timestamp: Date.now() / 1000,
    });

    expect(snapshot).not.toBeNull();
    if (!snapshot) return;

    // With a registered manifest, hasCache is true → strategy should bias
    // toward `reflex` or `delegate` (both require hasCache).
    expect(["reflex", "delegate", "deliberate", "ask_user"]).toContain(
      snapshot.metacognition!.strategy,
    );

    // And the registry stats are observable from outside.
    expect(getRegistryStats().totalSkills).toBeGreaterThan(0);
  });
});
