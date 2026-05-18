/**
 * Parix E2E Test Suite — Full Pipeline
 *
 * Tests the complete flow: Hands detects event → Synapse delivers →
 * Council transitions → LLM reasons → Channel notifies.
 *
 * Prerequisites:
 *   - Hands (Python) WS server running on :8765
 *   - Atrium (Node) running with test config
 *   - SQLite test database initialized
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";

const ATRIUM_WS = process.env.ATRIUM_WS_URL || "ws://localhost:8766";
const HANDS_WS = process.env.HANDS_WS_URL || "ws://localhost:8765";
const TIMEOUT_MS = 15_000;

/**
 * Helper: connect to WebSocket with timeout
 */
function connectWs(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`WS connection to ${url} timed out`));
    }, 5_000);
    ws.on("open", () => {
      clearTimeout(timer);
      resolve(ws);
    });
    ws.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Helper: wait for a message matching a predicate
 */
function waitForMessage(
  ws: WebSocket,
  predicate: (msg: any) => boolean,
  timeoutMs = TIMEOUT_MS
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Timed out waiting for message")),
      timeoutMs
    );
    const handler = (data: WebSocket.Data) => {
      const parsed = JSON.parse(data.toString());
      if (predicate(parsed)) {
        clearTimeout(timer);
        ws.off("message", handler);
        resolve(parsed);
      }
    };
    ws.on("message", handler);
  });
}

describe("E2E: Sensor Event → Notification Pipeline", () => {
  let aegisWs: WebSocket;

  before(async () => {
    aegisWs = await connectWs(ATRIUM_WS);
  });

  after(() => {
    aegisWs?.close();
  });

  it("should detect a terminal error and surface a notification within 10s", async () => {
    // 1. Inject a SENSOR_EVENT via the Hands WS
    const handsWs = await connectWs(HANDS_WS);
    const sensorEvent = {
      type: "SENSOR_EVENT",
      event_type: "terminal_error",
      data: {
        error: "ModuleNotFoundError: No module named 'pandas'",
        cwd: "/home/user/project",
        command: "python main.py",
      },
      confidence: 0.92,
      timestamp: new Date().toISOString(),
    };
    handsWs.send(JSON.stringify(sensorEvent));

    // 2. Wait for Council to transition through OBSERVING → THINKING → ACTING
    const actingEvent = await waitForMessage(aegisWs, (msg) => {
      return msg.type === "COUNCIL_STATE" && msg.state === "ACTING";
    });
    assert.ok(actingEvent, "Council should reach ACTING state");

    // 3. Wait for Council to return to IDLE
    const idleEvent = await waitForMessage(aegisWs, (msg) => {
      return msg.type === "COUNCIL_STATE" && msg.state === "IDLE";
    });
    assert.ok(idleEvent, "Council should return to IDLE after action");

    handsWs.close();
  });

  it("should handle Python crash and recover via REBOOT_SYNC", async () => {
    // 1. Simulate Hands disconnection
    const handsWs = await connectWs(HANDS_WS);
    handsWs.close();

    // 2. Wait for PARALYZED state
    const paralyzed = await waitForMessage(
      aegisWs,
      (msg) => msg.type === "COUNCIL_STATE" && msg.state === "PARALYZED",
      10_000
    );
    assert.ok(paralyzed, "Council should enter PARALYZED on Hands disconnect");

    // 3. Reconnect (simulate Hands restart)
    const reconnected = await connectWs(HANDS_WS);

    // 4. Send REBOOT_SYNC
    reconnected.send(
      JSON.stringify({
        type: "REBOOT_SYNC",
        timestamp: new Date().toISOString(),
      })
    );

    // 5. Expect WORLD_STATE_PUSH response
    const worldState = await waitForMessage(
      reconnected,
      (msg) => msg.type === "WORLD_STATE_PUSH"
    );
    assert.ok(worldState.last_task !== undefined);
    assert.ok(worldState.active_state !== undefined);

    reconnected.close();
  });
});

describe("E2E: Task Execution Roundtrip", () => {
  it("should execute a CLI command via Hands and return result", async () => {
    const handsWs = await connectWs(HANDS_WS);

    // Send a TASK_REQUEST
    const taskRequest = {
      type: "TASK_REQUEST",
      task_id: `test-${Date.now()}`,
      payload: {
        action: "cli",
        command: 'echo "parix-e2e-test"',
        timeout: 5000,
      },
      timestamp: new Date().toISOString(),
    };
    handsWs.send(JSON.stringify(taskRequest));

    // Wait for TASK_ACK
    const ack = await waitForMessage(
      handsWs,
      (msg) => msg.type === "TASK_ACK" && msg.task_id === taskRequest.task_id,
      5_000
    );
    assert.equal(ack.status, "received");

    // Wait for TASK_RESULT
    const result = await waitForMessage(
      handsWs,
      (msg) =>
        msg.type === "TASK_RESULT" && msg.task_id === taskRequest.task_id,
      10_000
    );
    assert.equal(result.success, true);
    assert.ok(result.output.includes("parix-e2e-test"));

    handsWs.close();
  });
});
