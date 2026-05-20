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
// task-clipboard-secret-redactor
// ---------------------------------------------------------------------------

describe("task-clipboard-secret-redactor", () => {
  const ID = "task-clipboard-secret-redactor";

  it("registers and matches on clipboard_sensitive_data", () => {
    const reg = getRegisteredSkill(ID);
    expect(reg).toBeDefined();
    const matches = matchSkills({
      type: "clipboard_sensitive_data",
      data: { matches: ["github_token"], length: 64 },
      confidence: 0.95,
    });
    expect(matches.some((m) => m.manifest.id === ID)).toBe(true);
  });

  it("returns high severity + clear-recommended for github_token", async () => {
    const reg = getRegisteredSkill(ID);
    const result = await runSkill({
      skillDir: reg!.skillDir,
      manifest: reg!.manifest,
      inputs: { matches: ["github_token"], length: 64 },
      permittedPermissions: permittedPermissionsForSkill(ID),
    });
    expect(result.success).toBe(true);
    expect(result.output!.severity).toBe("high");
    expect(result.output!.clipboardClearRecommended).toBe(true);
    expect(result.output!.families).toContain("github_token");
    expect(Array.isArray(result.output!.guidance)).toBe(true);
    expect((result.output!.guidance as string[]).length).toBeGreaterThan(0);
  });

  it("returns medium severity for generic password match (no clear-recommended)", async () => {
    const reg = getRegisteredSkill(ID);
    const result = await runSkill({
      skillDir: reg!.skillDir,
      manifest: reg!.manifest,
      inputs: { matches: ["password"], length: 32 },
    });
    expect(result.success).toBe(true);
    expect(result.output!.severity).toBe("medium");
    expect(result.output!.clipboardClearRecommended).toBe(false);
  });

  it("falls back gracefully on empty matches", async () => {
    const reg = getRegisteredSkill(ID);
    const result = await runSkill({
      skillDir: reg!.skillDir,
      manifest: reg!.manifest,
      inputs: { matches: [] },
    });
    expect(result.success).toBe(true);
    expect(result.output!.families).toEqual([]);
    expect(result.output!.severity).toBe("low");
    expect(result.output!.clipboardClearRecommended).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// task-build-watch
// ---------------------------------------------------------------------------

describe("task-build-watch", () => {
  const ID = "task-build-watch";

  it("registers and matches on build_watch_tick", () => {
    const reg = getRegisteredSkill(ID);
    expect(reg).toBeDefined();
    const matches = matchSkills({
      type: "build_watch_tick",
      data: {},
      confidence: 0.9,
    });
    expect(matches.some((m) => m.manifest.id === ID)).toBe(true);
  });

  it("rejects missing command argv", async () => {
    const reg = getRegisteredSkill(ID);
    const result = await runSkill({
      skillDir: reg!.skillDir,
      manifest: reg!.manifest,
      inputs: {},
      permittedPermissions: permittedPermissionsForSkill(ID),
    });
    expect(result.exitCode).toBe(1);
    expect(result.output!.error).toBe("missing_command");
  });

  it("rejects a string command (must be argv array)", async () => {
    const reg = getRegisteredSkill(ID);
    const result = await runSkill({
      skillDir: reg!.skillDir,
      manifest: reg!.manifest,
      inputs: { command: "echo hi" },
    });
    expect(result.exitCode).toBe(1);
    expect(result.output!.error).toBe("missing_command");
  });

  it("runs a real command and reports success", async () => {
    const reg = getRegisteredSkill(ID);
    const result = await runSkill({
      skillDir: reg!.skillDir,
      manifest: reg!.manifest,
      inputs: {
        command:
          process.platform === "win32"
            ? ["cmd", "/c", "echo ok"]
            : ["sh", "-c", "echo ok"],
        timeoutSeconds: 10,
      },
    });
    expect(result.success).toBe(true);
    expect(result.output!.success).toBe(true);
    expect(result.output!.exitCode).toBe(0);
    expect(result.output!.firstErrorLine).toBe("");
  });
});

// ---------------------------------------------------------------------------
// task-focus-context
// ---------------------------------------------------------------------------

describe("task-focus-context", () => {
  const ID = "task-focus-context";

  it("registers and matches on focus_change", () => {
    const reg = getRegisteredSkill(ID);
    expect(reg).toBeDefined();
    const matches = matchSkills({
      type: "focus_change",
      data: { focused_app: "Code", previous_app: "Terminal" },
      confidence: 0.9,
    });
    expect(matches.some((m) => m.manifest.id === ID)).toBe(true);
  });

  it("classifies VS Code as editor + defer", async () => {
    const reg = getRegisteredSkill(ID);
    const result = await runSkill({
      skillDir: reg!.skillDir,
      manifest: reg!.manifest,
      inputs: { focused_app: "Visual Studio Code", previous_app: "Terminal" },
      permittedPermissions: permittedPermissionsForSkill(ID),
    });
    expect(result.success).toBe(true);
    expect(result.output!.contextKind).toBe("editor");
    expect(result.output!.appFamily).toBe("vscode");
    expect(result.output!.shouldDeferAction).toBe(true);
  });

  it("classifies Zoom as chat + defer (on a call)", async () => {
    const reg = getRegisteredSkill(ID);
    const result = await runSkill({
      skillDir: reg!.skillDir,
      manifest: reg!.manifest,
      inputs: { focused_app: "Zoom Meetings", previous_app: "Chrome" },
    });
    expect(result.success).toBe(true);
    expect(result.output!.appFamily).toBe("zoom");
    expect(result.output!.shouldDeferAction).toBe(true);
  });

  it("classifies Terminal as terminal + no-defer", async () => {
    const reg = getRegisteredSkill(ID);
    const result = await runSkill({
      skillDir: reg!.skillDir,
      manifest: reg!.manifest,
      inputs: { focused_app: "Windows Terminal", previous_app: "Code" },
    });
    expect(result.success).toBe(true);
    expect(result.output!.contextKind).toBe("terminal");
    expect(result.output!.shouldDeferAction).toBe(false);
  });

  it("falls back to unknown for unfamiliar apps", async () => {
    const reg = getRegisteredSkill(ID);
    const result = await runSkill({
      skillDir: reg!.skillDir,
      manifest: reg!.manifest,
      inputs: { focused_app: "SomeRandomApp123", previous_app: "" },
    });
    expect(result.success).toBe(true);
    expect(result.output!.contextKind).toBe("unknown");
    expect(result.output!.shouldDeferAction).toBe(true);
  });
});
