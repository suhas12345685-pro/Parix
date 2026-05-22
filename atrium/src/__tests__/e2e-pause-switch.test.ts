import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { initDb, closeDb, getRecentEvents } from "../memory/db.js";
import { AtriumEngine } from "../intelligence/council.js";
import { SynapseClient } from "../synapse/client.js";
import { initAuditChain } from "../intelligence/audit.js";
import {
  pause as pauseAgent,
  resume as resumeAgent,
  isPaused,
  toggle as togglePause,
} from "../intelligence/pause.js";
import { dispatch as notifyDispatch } from "../intelligence/notify.js";

// Mock the notify channel
vi.mock("../intelligence/notify.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../intelligence/notify.js")>();
  return {
    ...actual,
    dispatch: vi.fn(async () => true),
  };
});

function makeFakeSynapse(): SynapseClient {
  const synapse = new SynapseClient();
  (synapse as any).getStatus = () => "CONNECTED";
  (synapse as any).sendTask = async () => ({
    success: false,
    output: "",
    error: "synapse not connected (test stub)",
  });
  (synapse as any).updateWorldState = () => {};
  (synapse as any).getPendingCount = () => 0;
  return synapse;
}

describe("Pause Switch Integration", () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = mkdtempSync(join(tmpdir(), "parix-integration-pause-"));
    await initDb(join(workDir, "memory.db"));
    initAuditChain();
    
    // Reset pause state to normal (unpaused) before each test
    if (isPaused()) {
      resumeAgent();
    }
    vi.clearAllMocks();
  });

  afterEach(() => {
    closeDb();
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      // ignore Windows locking
    }
  });

  it("should record events to database while paused but NOT trigger council processing", async () => {
    // 1. Initially, we should be unpaused
    expect(isPaused()).toBe(false);

    // 2. Pause the agent
    pauseAgent("test_integration");
    expect(isPaused()).toBe(true);

    // Verify a high-urgency notification was dispatched
    expect(notifyDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "⏸ Parix Paused",
        urgency: "high",
      })
    );

    // 3. Ingest a sensor event while paused
    const synapse = makeFakeSynapse();
    const engine = new AtriumEngine(synapse);

    engine.ingestSensorEvent({
      event_type: "disk_space_low",
      data: { freeMb: 100, drive: "D:" },
      confidence: 0.99,
      timestamp: Date.now() / 1000,
    });

    // 4. Verify the event WAS written to the SQLite database
    const events = getRecentEvents(10);
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].event_type).toBe("disk_space_low");

    // 5. Verify that engine did NOT process this event (it should remain in queue and engine state should still be IDLE)
    expect(engine.getState()).toBe("IDLE");

    // 6. Resume the agent
    resumeAgent();
    expect(isPaused()).toBe(false);

    // Verify a resume notification was dispatched
    expect(notifyDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "▶ Parix Resumed",
        urgency: "high",
      })
    );
  });

  it("should support toggling the pause state", () => {
    expect(isPaused()).toBe(false);
    
    // Toggle to paused
    const state1 = togglePause();
    expect(state1).toBe(true);
    expect(isPaused()).toBe(true);

    // Toggle back to resumed
    const state2 = togglePause();
    expect(state2).toBe(false);
    expect(isPaused()).toBe(false);
  });
});
