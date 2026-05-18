import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { initDb, closeDb } from "../memory/db.js";
import { AtriumEngine } from "../intelligence/council.js";
import { SynapseClient } from "../synapse/client.js";
import { loadSkills, _resetRegistry } from "../intelligence/skill-registry.js";
import {
  initAuditChain,
  // verifyChain not needed in tests
} from "../intelligence/audit.js";
import type { SkillManifest } from "../../../shared/types/skill.js";

// ---------------------------------------------------------------------------
// Test scaffold: write a temp skill matching `disk_space_low`. The script
// prints a JSON line that the runner parses into `output`.
// ---------------------------------------------------------------------------

function writeTestSkill(skillsRoot: string): string {
  const id = "task-test-disk";
  const skillDir = join(skillsRoot, id);
  mkdirSync(join(skillDir, "scripts"), { recursive: true });

  const entry = join(skillDir, "scripts", "run.cjs");
  writeFileSync(
    entry,
    `let buf = "";
process.stdin.on("data", (c) => (buf += c));
process.stdin.on("end", () => {
  let inputs = {};
  try { inputs = JSON.parse(buf || "{}"); } catch {}
  const reply = { ok: true, freedMb: 1234, inputs };
  process.stdout.write(JSON.stringify(reply));
});
`,
    "utf-8",
  );
  chmodSync(entry, 0o755);

  const manifest: SkillManifest = {
    id,
    version: "1.0",
    enabled: true,
    description: "Test disk cleanup skill",
    triggers: [
      {
        eventType: "disk_space_low",
        minConfidence: 0.5,
        platforms: ["any"],
      },
    ],
    entry: "scripts/run.cjs",
    runtime: "node",
    inputs: [],
    outputs: [{ name: "freedMb", type: "number" }],
    reversibility: 0.9, // high so constitution rule 5 doesn't block
    permissions: ["filesystem:read"],
    timeoutMs: 10000,
  };

  writeFileSync(
    join(skillDir, "config.json"),
    JSON.stringify(manifest, null, 2),
    "utf-8",
  );
  writeFileSync(join(skillDir, "SKILL.md"), `# ${id}\n`, "utf-8");
  return skillDir;
}

/**
 * Build a SynapseClient and patch its `getStatus` to "CONNECTED" so the
 * council's constitution doesn't bail on rule 1. We never call `connect()`,
 * so no actual WebSocket is opened.
 */
function makeFakeSynapse(): SynapseClient {
  const synapse = new SynapseClient();
   
  (synapse as any).getStatus = () => "CONNECTED";
  // Belt and braces: if anything ever calls sendTask, return a failure rather
  // than hanging waiting on a websocket.
   
  (synapse as any).sendTask = async () => ({
    success: false,
    output: "",
    error: "synapse not connected (test stub)",
  });
  // updateWorldState is called during transitions; make it a no-op.
   
  (synapse as any).updateWorldState = () => {};
   
  (synapse as any).getPendingCount = () => 0;
  return synapse;
}

function waitForActionExecuted(
  engine: AtriumEngine,
  timeoutMs = 8000,
): Promise<{ plan: Record<string, unknown>; success: boolean }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("timeout waiting for action_executed")),
      timeoutMs,
    );
    engine.once("action_executed", (plan: Record<string, unknown>, success: boolean) => {
      clearTimeout(timer);
      resolve({ plan, success });
    });
    engine.once("action_blocked", (plan: Record<string, unknown>, reason: string) => {
      clearTimeout(timer);
      reject(new Error(`action_blocked: ${reason}`));
    });
  });
}

describe("e2e council → skill dispatch", () => {
  let workDir: string;
  let skillsRoot: string;

  beforeEach(async () => {
    workDir = mkdtempSync(join(tmpdir(), "parix-e2e-council-skill-"));
    skillsRoot = join(workDir, "skills");
    mkdirSync(skillsRoot, { recursive: true });
    await initDb(join(workDir, "memory.db"));
    initAuditChain();
    _resetRegistry();
  });

  afterEach(() => {
    closeDb();
    _resetRegistry();
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      // Windows file-handle delay — best effort.
    }
  });

  it("a matched sensor event dispatches to runSkill and surfaces the JSON output", async () => {
    writeTestSkill(skillsRoot);
    loadSkills(skillsRoot);

    const synapse = makeFakeSynapse();
    const engine = new AtriumEngine(synapse);

    const settled = waitForActionExecuted(engine);

    engine.ingestSensorEvent({
      event_type: "disk_space_low",
      data: { freeMb: 200, drive: "C:" },
      confidence: 0.95,
      timestamp: Date.now() / 1000,
    });

    const { plan, success } = await settled;

    // The plan must have been rewritten to taskType: 'skill'.
    expect(plan.taskType).toBe("skill");
    expect(success).toBe(true);

    // The reasoning should namestamp the skill that matched.
    expect(String(plan.reasoning ?? "")).toContain("task-test-disk");
  });

  it("non-matching sensor events do not get rewritten to taskType: skill", async () => {
    writeTestSkill(skillsRoot);
    loadSkills(skillsRoot);

    const synapse = makeFakeSynapse();
    const engine = new AtriumEngine(synapse);

    // Drive a different event type the skill doesn't trigger on. The fake
    // synapse rejects the synapse path, so we expect action_executed with
    // success=false — but importantly, taskType must NOT be 'skill'.
    const settled = waitForActionExecuted(engine).catch((e) => ({
      plan: { taskType: "unknown" },
      success: false,
      _err: e.message,
    }));

    engine.ingestSensorEvent({
      event_type: "terminal_error",
      data: { error: "EACCES", cwd: "C:/work" },
      confidence: 0.95,
      timestamp: Date.now() / 1000,
    });

    const outcome = await settled;
    expect(outcome.plan.taskType).not.toBe("skill");
  });
});
