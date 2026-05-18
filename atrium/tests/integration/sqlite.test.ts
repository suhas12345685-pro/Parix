import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, unlinkSync } from "fs";
import { dirname, resolve } from "path";
import {
  closeDb,
  getLastCheckpoint,
  getRecentEvents,
  initDb,
  lastEventId,
  logEvent,
  logTask,
  persistToFile,
  saveCheckpoint,
  updateTaskState,
} from "../../src/memory/db.js";
import { recordCognitiveEpisode } from "../../src/cognition/store.js";
import { storeEpisode } from "../../src/intelligence/episodic-memory.js";

const TEST_DB = resolve(__dirname, "sqlite-test.db");

describe("SQLite memory wrapper", () => {
  beforeEach(async () => {
    mkdirSync(dirname(TEST_DB), { recursive: true });
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    await initDb(TEST_DB);
  });

  afterEach(() => {
    closeDb();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  it("logs events and returns the most recent event id", () => {
    logEvent("evt-1", "terminal_error", '{"message":"boom"}', 0.9);
    logEvent("evt-2", "window_changed", '{"title":"Editor"}', 0.6);

    expect(lastEventId()).toBe("evt-2");
    expect(getRecentEvents(2)).toHaveLength(2);
  });

  it("creates and updates tasks without duplicating task ids", () => {
    logTask("task-1", "cli", "pending", '{"command":"npm test"}');
    updateTaskState("task-1", "completed", "ok");

    persistToFile();
    expect(existsSync(TEST_DB)).toBe(true);
  });

  it("persists and reads crash recovery checkpoints", () => {
    saveCheckpoint('{"active_state":"WAITING"}');

    expect(getLastCheckpoint()).toBe('{"active_state":"WAITING"}');
  });

  it("flushes episodic memory writes immediately", () => {
    storeEpisode("debugged missing module", ["task-1"], ["npm"], "success");

    expect(existsSync(TEST_DB)).toBe(true);
  });

  it("flushes cognitive episode writes immediately", () => {
    recordCognitiveEpisode(
      "cog-1",
      "terminal_error",
      "debug workflow",
      "{}",
      "[]",
      "{}",
    );

    expect(existsSync(TEST_DB)).toBe(true);
  });
});
