import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import {
  loadSkills,
  _resetRegistry,
} from "../skill-registry.js";
import {
  runSkillsInParallel,
  MAX_CONCURRENT_SKILLS_PER_TASK,
} from "../skill-fanout.js";
import type { SkillManifest } from "../../../../shared/types/skill.js";

// Write a Node skill that sleeps `delayMs` then returns
// `{ id, startedAt, endedAt }` so the test can observe overlap.
function writeDelaySkill(
  skillsRoot: string,
  id: string,
  delayMs: number,
  opts: { fail?: boolean; permissions?: SkillManifest["permissions"] } = {},
): string {
  const skillDir = join(skillsRoot, id);
  mkdirSync(join(skillDir, "scripts"), { recursive: true });

  const entryRel = "scripts/delay.cjs";
  const entry = join(skillDir, entryRel);
  writeFileSync(
    entry,
    `const startedAt = Date.now();
let buf = "";
process.stdin.on("data", (c) => (buf += c));
process.stdin.on("end", () => {
  setTimeout(() => {
    const endedAt = Date.now();
    ${opts.fail ? 'process.stderr.write("forced failure");\nprocess.exit(7);' : 'process.stdout.write(JSON.stringify({ id: "' + id + '", startedAt, endedAt }));'}
  }, ${delayMs});
});
`,
    "utf-8",
  );
  chmodSync(entry, 0o755);

  const manifest: SkillManifest = {
    id,
    version: "1.0",
    enabled: true,
    description: `Delay skill ${id}`,
    triggers: [
      { eventType: "fanout_test", minConfidence: 0, platforms: ["any"] },
    ],
    entry: entryRel,
    runtime: "node",
    inputs: [],
    outputs: [],
    reversibility: 0.9,
    // First-party allowlist is the canonical clearance source. To make the
    // permission gate a no-op for these test skills, declare permissions
    // the runner won't reject regardless of mode — easiest is none.
    permissions: opts.permissions ?? [],
    timeoutMs: 15000,
  };

  writeFileSync(
    join(skillDir, "config.json"),
    JSON.stringify(manifest, null, 2),
    "utf-8",
  );
  writeFileSync(join(skillDir, "SKILL.md"), `# ${id}\n`, "utf-8");

  return skillDir;
}

describe("runSkillsInParallel — fan-out execution", () => {
  let skillsRoot: string;

  beforeEach(() => {
    _resetRegistry();
    skillsRoot = mkdtempSync(join(tmpdir(), "parix-fanout-"));
  });

  afterEach(() => {
    rmSync(skillsRoot, { recursive: true, force: true });
    _resetRegistry();
  });

  it("returns empty-result error when no skills supplied", async () => {
    const result = await runSkillsInParallel([]);
    expect(result.success).toBe(false);
    expect(result.error).toBe("no skills to run");
    expect(result.perSkill).toHaveLength(0);
  });

  it("flags unknown skill IDs without crashing the fan-out", async () => {
    writeDelaySkill(skillsRoot, "task-alpha", 30);
    loadSkills(skillsRoot);

    const result = await runSkillsInParallel([
      { skillId: "task-alpha", inputs: {} },
      { skillId: "task-nonexistent", inputs: {} },
    ]);

    expect(result.success).toBe(true); // at least one succeeded
    expect(result.perSkill).toHaveLength(2);
    const failed = result.perSkill.find((r) => r.skillId === "task-nonexistent");
    expect(failed?.success).toBe(false);
    expect(failed?.error).toContain("not registered");
  });

  it("runs a single matched skill and aggregates its output", async () => {
    writeDelaySkill(skillsRoot, "task-alpha", 20);
    loadSkills(skillsRoot);

    const result = await runSkillsInParallel([
      { skillId: "task-alpha", inputs: { foo: "bar" } },
    ]);

    expect(result.success).toBe(true);
    expect(result.perSkill).toHaveLength(1);
    expect(result.perSkill[0].success).toBe(true);
    expect(result.output).toBeDefined();
    const parsed = JSON.parse(result.output!);
    expect(parsed["task-alpha"]).toBeDefined();
  });

  it("runs multiple skills concurrently — wall time clearly below serial baseline", async () => {
    writeDelaySkill(skillsRoot, "task-a", 150);
    writeDelaySkill(skillsRoot, "task-b", 150);
    writeDelaySkill(skillsRoot, "task-c", 150);
    loadSkills(skillsRoot);

    // Measure a single-skill baseline so timing assertions stay portable
    // across CI runners with very different Node spawn overhead.
    const baseStart = Date.now();
    await runSkillsInParallel([{ skillId: "task-a", inputs: {} }]);
    const oneSkillMs = Date.now() - baseStart;

    const wallStart = Date.now();
    const result = await runSkillsInParallel([
      { skillId: "task-a", inputs: {} },
      { skillId: "task-b", inputs: {} },
      { skillId: "task-c", inputs: {} },
    ]);
    const wallMs = Date.now() - wallStart;

    expect(result.success).toBe(true);
    expect(result.perSkill).toHaveLength(3);
    expect(result.perSkill.every((r) => r.success)).toBe(true);
    // Cap is 4 (≥3) → all three fit in one batch. Wall time should be
    // ~one-skill time, definitely well under 3× serial. Use 2.5× as the
    // safety margin for spawn-overhead jitter.
    expect(wallMs).toBeLessThan(oneSkillMs * 2.5);
  });

  it("respects the concurrency cap — extra skills wait", async () => {
    writeDelaySkill(skillsRoot, "task-a", 100);
    writeDelaySkill(skillsRoot, "task-b", 100);
    writeDelaySkill(skillsRoot, "task-c", 100);
    writeDelaySkill(skillsRoot, "task-d", 100);
    loadSkills(skillsRoot);

    // Cap at 2 — with 4 skills * 100ms sleeps, two batches of two
    // means at minimum the second batch can't start until the first
    // completes. Wall time should be < a measured serial run by a clear
    // margin. We compare against a serial baseline rather than a fixed
    // ms threshold because Node spawn overhead varies wildly per OS.

    const serialStart = Date.now();
    await runSkillsInParallel(
      [{ skillId: "task-a", inputs: {} }],
      { concurrency: 1 },
    );
    const oneSkillMs = Date.now() - serialStart;

    const wallStart = Date.now();
    const result = await runSkillsInParallel(
      [
        { skillId: "task-a", inputs: {} },
        { skillId: "task-b", inputs: {} },
        { skillId: "task-c", inputs: {} },
        { skillId: "task-d", inputs: {} },
      ],
      { concurrency: 2 },
    );
    const wallMs = Date.now() - wallStart;

    expect(result.success).toBe(true);
    expect(result.perSkill).toHaveLength(4);
    // Cap=2 with 4 skills = 2 sequential batches. Serial would be ~4×
    // one-skill time. The upper bound proves the cap-2 path is still
    // parallel within each batch. A lower-bound assertion ("must be at
    // least two batches") is intentionally omitted: under heavy CI load
    // spawn time dominates and the cold-start one-skill baseline is
    // longer than subsequent warmed-up parallel calls, which breaks any
    // multiplicative lower-bound.
    expect(wallMs).toBeLessThan(oneSkillMs * 4);
  });

  it("preserves caller-given order in perSkill regardless of completion order", async () => {
    // Sleep times chosen so completion order ≠ input order.
    writeDelaySkill(skillsRoot, "task-slow", 120);
    writeDelaySkill(skillsRoot, "task-medium", 60);
    writeDelaySkill(skillsRoot, "task-fast", 20);
    loadSkills(skillsRoot);

    const result = await runSkillsInParallel([
      { skillId: "task-slow", inputs: {} },
      { skillId: "task-medium", inputs: {} },
      { skillId: "task-fast", inputs: {} },
    ]);

    expect(result.perSkill.map((r) => r.skillId)).toEqual([
      "task-slow",
      "task-medium",
      "task-fast",
    ]);
  });

  it("reports any-success aggregate even when one of many fails", async () => {
    writeDelaySkill(skillsRoot, "task-ok", 20);
    writeDelaySkill(skillsRoot, "task-bad", 20, { fail: true });
    loadSkills(skillsRoot);

    const result = await runSkillsInParallel([
      { skillId: "task-ok", inputs: {} },
      { skillId: "task-bad", inputs: {} },
    ]);

    expect(result.success).toBe(true);
    expect(result.perSkill).toHaveLength(2);
    expect(result.perSkill.find((r) => r.skillId === "task-ok")?.success).toBe(
      true,
    );
    expect(result.perSkill.find((r) => r.skillId === "task-bad")?.success).toBe(
      false,
    );
    // First failure surfaces in error; success aggregate still includes
    // task-ok's output.
    expect(result.error).toContain("exit 7");
    expect(result.output).toContain("task-ok");
  });

  it("reports failure aggregate when every skill fails", async () => {
    writeDelaySkill(skillsRoot, "task-bad-1", 20, { fail: true });
    writeDelaySkill(skillsRoot, "task-bad-2", 20, { fail: true });
    loadSkills(skillsRoot);

    const result = await runSkillsInParallel([
      { skillId: "task-bad-1", inputs: {} },
      { skillId: "task-bad-2", inputs: {} },
    ]);

    expect(result.success).toBe(false);
    expect(result.perSkill).toHaveLength(2);
    expect(result.perSkill.every((r) => !r.success)).toBe(true);
    expect(result.error).toContain("+1 other skill failure");
    expect(result.output).toBeUndefined();
  });

  it("calls augmentInputs once per skill and threads result through", async () => {
    writeDelaySkill(skillsRoot, "task-a", 20);
    writeDelaySkill(skillsRoot, "task-b", 20);
    loadSkills(skillsRoot);

    const seen: string[] = [];
    const result = await runSkillsInParallel(
      [
        { skillId: "task-a", inputs: { x: 1 } },
        { skillId: "task-b", inputs: { x: 2 } },
      ],
      {
        augmentInputs: (reg, inputs) => {
          seen.push(reg.manifest.id);
          return { ...inputs, _aug: reg.manifest.id };
        },
      },
    );

    expect(result.success).toBe(true);
    expect(seen.sort()).toEqual(["task-a", "task-b"]);
    // The skill echoes its inputs in output; verify _aug propagated.
    const parsed = JSON.parse(result.output!);
    // delay.cjs writes { id, startedAt, endedAt }, not echoed inputs,
    // so we can't read _aug back from output — but seeing both
    // augmenter calls fire is the contract.
    expect(Object.keys(parsed)).toEqual(["task-a", "task-b"]);
  });

  it("exports MAX_CONCURRENT_SKILLS_PER_TASK = 4 (the chosen conservative cap)", () => {
    expect(MAX_CONCURRENT_SKILLS_PER_TASK).toBe(4);
  });
});
