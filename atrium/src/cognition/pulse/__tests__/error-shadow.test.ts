import { mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, initDb } from "../../../memory/db.js";
import type { CognitiveEvent } from "../../types.js";
import {
  getLastErrorShadow,
  maybeCreateErrorShadow,
  scoreErrorShadowNotification,
} from "../error-shadow.js";
import { getPulseMemory } from "../memory.js";

describe("Error-Shadow pre-computation", () => {
  let dir: string;
  let dbPath: string;
  let oldShadowDir: string | undefined;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "parix-error-shadow-"));
    dbPath = join(dir, "memory.db");
    oldShadowDir = process.env.PARIX_SHADOW_DRAFTS_DIR;
    process.env.PARIX_SHADOW_DRAFTS_DIR = join(dir, "shadow_drafts");
    await initDb(dbPath);
  });

  afterEach(() => {
    closeDb();
    if (oldShadowDir === undefined) {
      delete process.env.PARIX_SHADOW_DRAFTS_DIR;
    } else {
      process.env.PARIX_SHADOW_DRAFTS_DIR = oldShadowDir;
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes a silent shadow draft immediately for terminal stderr", () => {
    const draft = maybeCreateErrorShadow(moduleNotFoundEvent());

    expect(draft).not.toBeNull();
    expect(draft!.notificationChannel).toBe("silent");
    expect(draft!.suggestedFix).toContain("npm install left-pad");

    const body = readFileSync(draft!.draftPath, "utf-8");
    expect(body).toContain("# Error-Shadow Draft");
    expect(body).toContain("Cannot find module 'left-pad'");
    expect(body).toContain("shadow_drafts");

    const remembered = getPulseMemory("last_error_shadow");
    expect(remembered?.value).toMatchObject({
      eventHash: draft!.eventHash,
      draftPath: draft!.draftPath,
      notificationChannel: "silent",
    });
  });

  it("persists the Pulse memory and last draft across a DB restart", async () => {
    const draft = maybeCreateErrorShadow(moduleNotFoundEvent());
    expect(draft).not.toBeNull();

    closeDb();
    await initDb(dbPath);

    const restoredDraft = getLastErrorShadow();
    const restoredMemory = getPulseMemory("last_error_shadow");

    expect(restoredDraft?.eventHash).toBe(draft!.eventHash);
    expect(restoredMemory?.value).toMatchObject({
      eventHash: draft!.eventHash,
      draftPath: draft!.draftPath,
    });
  });

  it("only escalates notification mode after repeated high-signal errors", () => {
    const first = maybeCreateErrorShadow(moduleNotFoundEvent());
    const second = maybeCreateErrorShadow(moduleNotFoundEvent());
    const third = maybeCreateErrorShadow(moduleNotFoundEvent());

    expect(first?.notificationChannel).toBe("silent");
    expect(second?.notificationChannel).toBe("silent");
    expect(third?.notificationChannel).toBe("notify");
    expect(third?.repeatCount).toBe(3);
  });

  it("keeps single low-signal errors below the notification threshold", () => {
    const score = scoreErrorShadowNotification({
      confidence: 0.75,
      errorExcerpt: "warning: optional peer dependency missing",
      repeatCount: 1,
      cwd: "C:/work/app",
    });

    expect(score).toBeLessThan(0.86);
  });
});

function moduleNotFoundEvent(): CognitiveEvent {
  return {
    type: "terminal_error",
    data: {
      stderr:
        "Error: Cannot find module 'left-pad'\n    at Module._resolveFilename",
      cwd: "C:/Users/DELL/parix",
    },
    confidence: 0.91,
    timestamp: Date.now() / 1000,
  };
}
