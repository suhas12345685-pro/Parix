import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, unlinkSync } from "fs";
import { dirname, resolve } from "path";

const TEST_DB = resolve(__dirname, "metacognition-persistence-test.db");

describe("metacognition persistence", () => {
  afterEach(async () => {
    const db = await import("../../memory/db.js");
    db.closeDb();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    vi.resetModules();
  });

  it("hydrates calibration from persisted records instead of resetting to 0.6", async () => {
    mkdirSync(dirname(TEST_DB), { recursive: true });
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);

    let db = await import("../../memory/db.js");
    await db.initDb(TEST_DB);
    db.getDb().run(
      "INSERT INTO calibration_records (predicted_confidence, actual_outcome) VALUES (?, ?)",
      [0.95, 0],
    );
    db.persistToFile();
    db.closeDb();

    vi.resetModules();

    db = await import("../../memory/db.js");
    await db.initDb(TEST_DB);
    const metacognition = await import("../metacognition.js");

    expect(metacognition.getCalibrationScore()).toBeLessThan(0.2);
  });
});
