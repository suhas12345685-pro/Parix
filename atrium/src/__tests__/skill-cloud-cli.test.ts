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

beforeAll(() => {
  loadSkills(SKILLS_ROOT);
});

afterAll(() => {
  _resetRegistry();
});

// ---------------------------------------------------------------------------
// task-gcloud
// ---------------------------------------------------------------------------

describe("task-gcloud", () => {
  const ID = "task-gcloud";

  it("registers and matches on gcloud_command_request", () => {
    expect(getRegisteredSkill(ID)).toBeDefined();
    const matches = matchSkills({
      type: "gcloud_command_request",
      data: { args: ["compute", "instances", "list"] },
      confidence: 0.9,
    });
    expect(matches.some((m) => m.manifest.id === ID)).toBe(true);
  });

  it("classifies a `list` command as read and dry-runs by default", async () => {
    const reg = getRegisteredSkill(ID);
    const result = await runSkill({
      skillDir: reg!.skillDir,
      manifest: reg!.manifest,
      inputs: { args: ["compute", "instances", "list"] },
      permittedPermissions: permittedPermissionsForSkill(ID),
    });
    expect(result.success).toBe(true);
    expect(result.output!.operationClass).toBe("read");
    expect(result.output!.executed).toBe(false);
    // On a machine without gcloud installed, refusalReason is
    // "not_installed". On one with gcloud, it'd be "dry_run". Either
    // is correct.
    expect(["not_installed", "dry_run"]).toContain(result.output!.refusalReason);
  });

  it("classifies a `delete` command as destroy and refuses even with dryRun=false", async () => {
    const reg = getRegisteredSkill(ID);
    const result = await runSkill({
      skillDir: reg!.skillDir,
      manifest: reg!.manifest,
      inputs: {
        args: ["compute", "instances", "delete", "my-vm"],
        dryRun: false,
      },
    });
    expect(result.success).toBe(true);
    expect(result.output!.operationClass).toBe("destroy");
    expect(result.output!.executed).toBe(false);
    // Refusal reason is either not_installed (no gcloud here) or
    // destructive_requires_approval (gcloud present but blocked).
    expect([
      "not_installed",
      "not_authenticated",
      "destructive_requires_approval",
    ]).toContain(result.output!.refusalReason);
  });

  it("classifies `create` as mutate", async () => {
    const reg = getRegisteredSkill(ID);
    const result = await runSkill({
      skillDir: reg!.skillDir,
      manifest: reg!.manifest,
      inputs: { args: ["projects", "create", "my-proj"] },
    });
    expect(result.output!.operationClass).toBe("mutate");
  });

  it("rejects empty args", async () => {
    const reg = getRegisteredSkill(ID);
    const result = await runSkill({
      skillDir: reg!.skillDir,
      manifest: reg!.manifest,
      inputs: { args: [] },
    });
    expect(result.exitCode).toBe(1);
    expect(result.output!.refusalReason).toBe("missing_args");
  });
});

// ---------------------------------------------------------------------------
// task-azure-cli
// ---------------------------------------------------------------------------

describe("task-azure-cli", () => {
  const ID = "task-azure-cli";

  it("registers and matches on azure_command_request", () => {
    expect(getRegisteredSkill(ID)).toBeDefined();
    const matches = matchSkills({
      type: "azure_command_request",
      data: { args: ["vm", "list"] },
      confidence: 0.9,
    });
    expect(matches.some((m) => m.manifest.id === ID)).toBe(true);
  });

  it("also matches on the az_command_request alias", () => {
    const matches = matchSkills({
      type: "az_command_request",
      data: { args: ["vm", "list"] },
      confidence: 0.9,
    });
    expect(matches.some((m) => m.manifest.id === ID)).toBe(true);
  });

  it("classifies a `list` command as read", async () => {
    const reg = getRegisteredSkill(ID);
    const result = await runSkill({
      skillDir: reg!.skillDir,
      manifest: reg!.manifest,
      inputs: { args: ["vm", "list"] },
      permittedPermissions: permittedPermissionsForSkill(ID),
    });
    expect(result.output!.operationClass).toBe("read");
    expect(result.output!.executed).toBe(false);
  });

  it("classifies a `delete` command as destroy and refuses", async () => {
    const reg = getRegisteredSkill(ID);
    const result = await runSkill({
      skillDir: reg!.skillDir,
      manifest: reg!.manifest,
      inputs: {
        args: ["group", "delete", "--name", "my-rg", "--yes"],
        dryRun: false,
      },
    });
    expect(result.output!.operationClass).toBe("destroy");
    expect(result.output!.executed).toBe(false);
    expect([
      "not_installed",
      "not_authenticated",
      "destructive_requires_approval",
    ]).toContain(result.output!.refusalReason);
  });

  it("classifies `set` as mutate", async () => {
    const reg = getRegisteredSkill(ID);
    const result = await runSkill({
      skillDir: reg!.skillDir,
      manifest: reg!.manifest,
      inputs: { args: ["account", "set", "--subscription", "x"] },
    });
    expect(result.output!.operationClass).toBe("mutate");
  });

  it("rejects empty args", async () => {
    const reg = getRegisteredSkill(ID);
    const result = await runSkill({
      skillDir: reg!.skillDir,
      manifest: reg!.manifest,
      inputs: { args: [] },
    });
    expect(result.exitCode).toBe(1);
    expect(result.output!.refusalReason).toBe("missing_args");
  });
});
