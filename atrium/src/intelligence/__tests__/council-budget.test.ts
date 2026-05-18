import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { initDb, closeDb } from "../../memory/db.js";
import { AtriumEngine } from "../council.js";
import { resume, isPaused } from "../pause.js";
import { SynapseClient } from "../../synapse/client.js";
import {
  TokenBudgetExceededError,
  type LLMRouter,
} from "../../llm/router.js";

function makeFakeSynapse(): SynapseClient {
  const synapse = new SynapseClient();
   
  (synapse as any).getStatus = () => "CONNECTED";
   
  (synapse as any).updateWorldState = () => {};
   
  (synapse as any).getPendingCount = () => 0;
  return synapse;
}

describe("council token budget handling", () => {
  let workDir: string;
  let engine: AtriumEngine;

  beforeEach(async () => {
    workDir = join(tmpdir(), `parix-council-budget-${Date.now()}`);
    mkdirSync(workDir, { recursive: true });
    await initDb(join(workDir, "memory.db"));
    resume();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    engine?.destroy();
    resume();
    closeDb();
    vi.restoreAllMocks();
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      // Best effort on Windows.
    }
  });

  it("pauses and returns to IDLE when LLM planning exceeds the token budget", async () => {
    engine = new AtriumEngine(makeFakeSynapse());
    engine.setLLMRouter({
      async complete() {
        throw new TokenBudgetExceededError("reasoning", 120_000);
      },
    } as unknown as LLMRouter);

    const settled = new Promise<void>((resolve) => {
      engine.once("error", (err) => {
        expect(err).toBeInstanceOf(TokenBudgetExceededError);
        resolve();
      });
    });

    engine.ingestSensorEvent({
      event_type: "unmapped_high_confidence_signal",
      data: { source: "unit-test" },
      confidence: 0.95,
      timestamp: Date.now() / 1000,
    });

    await settled;

    expect(engine.getState()).toBe("IDLE");
    expect(isPaused()).toBe(true);
  });
});
