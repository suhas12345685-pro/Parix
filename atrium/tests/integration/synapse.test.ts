import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import { SynapseClient } from "../../src/synapse/client.js";
import { initDb, closeDb } from "../../src/memory/db.js";
import { WebSocketServer, WebSocket } from "ws";
import { resolve } from "path";
import { existsSync, unlinkSync, mkdirSync } from "fs";
import { dirname } from "path";

const TEST_DB = resolve(__dirname, "synapse-test.db");
const TEST_PORT = 8760;

describe("SynapseClient Integration", () => {
  let synapse: SynapseClient;
  let wss: WebSocketServer;
  let serverSocket: WebSocket | null = null;
  let onMessage: ((msg: any) => void) | null = null;

  beforeAll(async () => {
    mkdirSync(dirname(TEST_DB), { recursive: true });
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    await initDb(TEST_DB);
  });

  afterAll(() => {
    closeDb();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  beforeEach(() => {
    wss = new WebSocketServer({ port: TEST_PORT });
    wss.on("connection", (ws) => {
      serverSocket = ws;
      ws.on("message", (data) => {
        if (onMessage) onMessage(JSON.parse(data.toString()));
      });
    });

    synapse = new SynapseClient(TEST_PORT);
  });

  afterEach(() => {
    synapse.disconnect();
    wss.close();
    serverSocket = null;
    onMessage = null;
  });

  it("connects and pushes world state immediately", () => {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Timeout waiting for WORLD_STATE_PUSH")),
        2000,
      );

      onMessage = (msg) => {
        if (msg.type === "WORLD_STATE_PUSH") {
          clearTimeout(timeout);
          expect(msg.active_state).toBe("IDLE");
          resolve();
        }
      };

      synapse.connect();
    });
  });

  it("handles full task roundtrip (request -> ack -> result)", async () => {
    onMessage = (msg) => {
      if (msg.type === "TASK_REQUEST") {
        // Send ACK
        serverSocket?.send(
          JSON.stringify({
            type: "TASK_ACK",
            task_id: msg.task_id,
            timestamp: Date.now() / 1000,
          }),
        );

        // Send Result shortly after
        setTimeout(() => {
          serverSocket?.send(
            JSON.stringify({
              type: "TASK_RESULT",
              task_id: msg.task_id,
              success: true,
              output: "Task succeeded",
              timestamp: Date.now() / 1000,
            }),
          );
        }, 50);
      }
    };

    synapse.connect();
    // wait for connection
    await new Promise<void>((r) => {
      synapse.on("state_change", (state) => {
        if (state === "CONNECTED") r();
      });
    });

    const result = await synapse.sendTask("cli", { command: "echo hello" });
    expect(result.success).toBe(true);
    expect(result.output).toBe("Task succeeded");
  });

  it("emits sensor events received from Hands", async () => {
    synapse.connect();
    await new Promise<void>((r) => {
      synapse.on("state_change", (state) => {
        if (state === "CONNECTED") r();
      });
    });

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Timeout waiting for sensor_event")),
        2000,
      );

      synapse.on("sensor_event", (event) => {
        clearTimeout(timeout);
        expect(event.event_type).toBe("test_sensor");
        resolve();
      });

      serverSocket?.send(
        JSON.stringify({
          type: "SENSOR_EVENT",
          event_type: "test_sensor",
          data: {},
          confidence: 0.9,
          timestamp: Date.now() / 1000,
        }),
      );
    });
  });

  it("emits synapse:error for malformed payloads", async () => {
    synapse.connect();
    await new Promise<void>((r) => {
      synapse.on("state_change", (state) => {
        if (state === "CONNECTED") r();
      });
    });

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Timeout waiting for synapse:error")),
        2000,
      );

      synapse.on("synapse:error", (err) => {
        clearTimeout(timeout);
        expect(err.message).toContain("Malformed Synapse payload");
        expect(err.message).toContain("{bad-json");
        resolve();
      });

      serverSocket?.send("{bad-json");
    });
  });

  it("refuses to send if the socket closes after preflight", async () => {
    const mockSocket = {
      readyState: WebSocket.CLOSED,
      send() {
        throw new Error("send should not be called");
      },
      close() {},
    };

    (synapse as unknown as { status: string }).status = "CONNECTED";
    (synapse as unknown as { ws: typeof mockSocket }).ws = mockSocket;

    await expect(
      synapse.sendTask("cli", { command: "echo hello" }),
    ).rejects.toThrow("WebSocket is not open");
  });
});
