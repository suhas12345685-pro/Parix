/**
 * Parix E2E — Channel Delivery Tests
 *
 * Validates that notifications are delivered through configured channels.
 * Uses mock channel adapters in CI, real adapters in staging.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";

const ATRIUM_WS = process.env.ATRIUM_WS_URL || "ws://localhost:8766";
const TIMEOUT_MS = 10_000;

function connectWs(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => reject(new Error("WS timeout")), 5_000);
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

function waitForMessage(
  ws: WebSocket,
  predicate: (msg: any) => boolean,
  timeoutMs = TIMEOUT_MS
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Timed out")),
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

describe("E2E: Channel Delivery", () => {
  let ws: WebSocket;

  before(async () => {
    ws = await connectWs(ATRIUM_WS);
  });

  after(() => ws?.close());

  it("should deliver notification to desktop channel (default)", async () => {
    // Inject event that triggers notification
    ws.send(
      JSON.stringify({
        type: "TEST_TRIGGER_NOTIFICATION",
        channel: "desktop",
        message: "E2E test notification",
        timestamp: new Date().toISOString(),
      })
    );

    const delivered = await waitForMessage(
      ws,
      (msg) =>
        msg.type === "CHANNEL_DELIVERY_RESULT" && msg.channel === "desktop"
    );
    assert.equal(delivered.success, true);
  });

  it("should fallback to next channel on primary failure", async () => {
    ws.send(
      JSON.stringify({
        type: "TEST_TRIGGER_NOTIFICATION",
        channel: "telegram",
        simulate_failure: true,
        message: "E2E fallback test",
        timestamp: new Date().toISOString(),
      })
    );

    const fallback = await waitForMessage(
      ws,
      (msg) =>
        msg.type === "CHANNEL_DELIVERY_RESULT" && msg.fallback_used === true
    );
    assert.equal(fallback.success, true);
    assert.notEqual(fallback.channel, "telegram");
  });
});
