import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { initDb, closeDb } from "../memory/db.js";
import {
  handleA11ySnapshot,
  _resetA11yState,
  type AccessibilitySnapshotMessage,
} from "../synapse/a11y-handler.js";
import {
  loadSkills,
  getRegisteredSkill,
  _resetRegistry,
} from "../intelligence/skill-registry.js";
import { runSkill, SkillPermissionError } from "../intelligence/skill-runner.js";
import type {
  SkillManifest,
  SkillPermission,
} from "../../../shared/types/skill.js";

function writeEchoSkill(
  skillsRoot: string,
  id: string,
  permissions: SkillPermission[],
): void {
  const skillDir = join(skillsRoot, id);
  mkdirSync(join(skillDir, "scripts"), { recursive: true });

  const entryRel = "scripts/echo.cjs";
  const entry = join(skillDir, entryRel);
  writeFileSync(
    entry,
    `let buf = "";
process.stdin.on("data", (c) => (buf += c));
process.stdin.on("end", () => {
  let parsed = {};
  try { parsed = JSON.parse(buf || "{}"); } catch {}
  process.stdout.write(JSON.stringify({ ok: true, echoedInputs: parsed }));
});
`,
    "utf-8",
  );
  chmodSync(entry, 0o755);

  const manifest: SkillManifest = {
    id,
    version: "1.0",
    enabled: true,
    triggers: [{ eventType: "test_event" }],
    entry: entryRel,
    runtime: "node",
    inputs: [],
    outputs: [],
    reversibility: 0.9,
    permissions,
    timeoutMs: 5000,
  };
  writeFileSync(
    join(skillDir, "config.json"),
    JSON.stringify(manifest, null, 2),
    "utf-8",
  );
}

function makeA11yMsg(role: string, name: string): AccessibilitySnapshotMessage {
  return {
    type: "ACCESSIBILITY_SNAPSHOT",
    snapshot_id: "snap-test",
    focused_app: "TestApp",
    backend_used: "uiautomation",
    tree_summary: {
      focused_element: { role, name, value: null, state: ["focused"], bounds: null },
    },
    confidence: 0.9,
    timestamp: Date.now() / 1000,
  };
}

describe("accessibility:read permission gate", () => {
  let tmp: string;
  let skillsRoot: string;

  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), "parix-a11y-perm-"));
    skillsRoot = join(tmp, "skills");
    mkdirSync(skillsRoot, { recursive: true });
    await initDb(join(tmp, "memory.db"));
    _resetRegistry();
    _resetA11yState();
  });

  afterEach(() => {
    closeDb();
    _resetRegistry();
    _resetA11yState();
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      // Windows file-handle delay.
    }
  });

  it("runSkill rejects a manifest declaring accessibility:read when clearance omits it", async () => {
    writeEchoSkill(skillsRoot, "task-a11y-greedy", ["accessibility:read"]);
    loadSkills(skillsRoot);
    const reg = getRegisteredSkill("task-a11y-greedy")!;

    await expect(
      runSkill({
        skillDir: reg.skillDir,
        manifest: reg.manifest,
        permittedPermissions: new Set<SkillPermission>([]),
      }),
    ).rejects.toBeInstanceOf(SkillPermissionError);
  });

  it("runSkill allows the manifest when clearance includes accessibility:read", async () => {
    writeEchoSkill(skillsRoot, "task-a11y-allowed", ["accessibility:read"]);
    loadSkills(skillsRoot);
    const reg = getRegisteredSkill("task-a11y-allowed")!;

    // Surface a latest a11y snapshot so the augmentation path has something
    // to inject.
    handleA11ySnapshot(makeA11yMsg("text_field", "auth.py"));

    const result = await runSkill({
      skillDir: reg.skillDir,
      manifest: reg.manifest,
      inputs: { task: "echo" },
      permittedPermissions: new Set<SkillPermission>(["accessibility:read"]),
    });
    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();
    // The skill echoed the inputs back — we expect just the inputs we passed.
    // (Council augments separately; this test only proves the gate.)
    expect((result.output!.echoedInputs as Record<string, unknown>).task).toBe(
      "echo",
    );
  });

  it("schema-level: existing 11 task manifests do NOT request accessibility:read", () => {
    // Sanity: adding the new enum value didn't accidentally grant it.
    loadSkills(join(process.cwd(), "..", "skills"));
    // No assertions on count here; the validator script covers that.
    // Instead spot-check that no installed manifest holds the new permission.
    const allHaveIt: string[] = [];
    for (const id of [
      "task-disk-cleanup",
      "task-dev-env",
      "task-git-recovery",
    ]) {
      const reg = getRegisteredSkill(id);
      if (reg?.manifest.permissions.includes("accessibility:read")) {
        allHaveIt.push(id);
      }
    }
    expect(allHaveIt).toEqual([]);
  });
});
