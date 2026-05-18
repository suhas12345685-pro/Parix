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
import { WebSocketServer } from "ws";
import { resolve, dirname } from "path";
import { existsSync, unlinkSync, mkdirSync } from "fs";

const TEST_DB = resolve(__dirname, "crash-test.db");
const TEST_PORT = 8761;

describe("Crash Recovery Integration", () => {
  let synapse: SynapseClient;
  let wss: WebSocketServer | null = null;

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
    synapse = new SynapseClient(TEST_PORT);
  });

  afterEach(async () => {
    synapse.disconnect();
    if (wss) {
      await stopServer();
    }
  });

  function startServer(): Promise<void> {
    return new Promise((resolve) => {
      wss = new WebSocketServer({ port: TEST_PORT }, () => resolve());
    });
  }

  function stopServer(): Promise<void> {
    return new Promise((resolve) => {
      if (!wss) return resolve();
      wss.clients.forEach((c) => c.close());
      wss.close(() => {
        wss = null;
        resolve();
      });
    });
  }

  it("survives a server crash and automatically reconnects", async () => {
    await startServer();

    // Connect
    synapse.connect();
    await new Promise<void>((r) => {
      const handler = (state: string) => {
        if (state === "CONNECTED") {
          synapse.off("state_change", handler);
          r();
        }
      };
      synapse.on("state_change", handler);
    });

    expect(synapse.getStatus()).toBe("CONNECTED");

    // Crash the server
    await stopServer();

    await new Promise<void>((r) => {
      const handler = (state: string) => {
        if (state === "DISCONNECTED") {
          synapse.off("state_change", handler);
          r();
        }
      };
      synapse.on("state_change", handler);
    });

    expect(synapse.getStatus()).toBe("DISCONNECTED");

    // Restart the server
    await startServer();

    // Wait for auto-reconnect
    await new Promise<void>((r) => {
      const handler = (state: string) => {
        if (state === "CONNECTED") {
          synapse.off("state_change", handler);
          r();
        }
      };
      synapse.on("state_change", handler);
    });

    expect(synapse.getStatus()).toBe("CONNECTED");
  });

  it("rejects pending tasks if server crashes before result", async () => {
    await startServer();
    synapse.connect();
    await new Promise<void>((r) => {
      const handler = (state: string) => {
        if (state === "CONNECTED") {
          synapse.off("state_change", handler);
          r();
        }
      };
      synapse.on("state_change", handler);
    });

    // Send a task (will pend because server does not ack/result it)
    const taskPromise = synapse.sendTask("cli", { command: "sleep 10" });

    // Crash the server before it acks or sends result
    await stopServer();

    await expect(taskPromise).rejects.toThrow("Connection closed");
  });
});
