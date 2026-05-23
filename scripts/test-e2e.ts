/**
 * End-to-end integration test for Parix.
 *
 * Boots Hands (Python WebSocket server), then Atrium (Node brain),
 * sends a fake SENSOR_EVENT through a sensor client, and verifies
 * the full pipeline processes it.
 *
 * Usage:
 *   npx tsx scripts/test-e2e.ts
 */

import { spawn, type ChildProcess } from "child_process";
import { createServer as createNetServer } from "net";
import WebSocket from "ws";
import initSqlJs from "sql.js";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdirSync, existsSync, writeFileSync, readFileSync } from "fs";
import {
  createDefaultProfile,
  isPersonalProfile,
  validateProfile,
} from "../shared/hatchery-schema.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const ATRIUM_DIR = resolve(ROOT, "atrium");
const E2E_HOME = resolve(ROOT, ".parix-e2e");
const DATA_DIR = resolve(E2E_HOME, "data");
const MEMORY_DB = resolve(DATA_DIR, "memory.db");
let SYNAPSE_PORT = 0;
let AEGIS_PORT = 0;
const E2E_MARKER = `E2E_MARKER_${Date.now()}`;

// ── Helpers ─────────────────────────────────────────────────────────

function log(tag: string, msg: string) {
  console.log(`\x1b[36m[E2E:${tag}]\x1b[0m ${msg}`);
}

function err(tag: string, msg: string) {
  console.error(`\x1b[31m[E2E:${tag}]\x1b[0m ${msg}`);
}

function ok(msg: string) {
  console.log(`\x1b[32m  ✓ ${msg}\x1b[0m`);
}

function fail(msg: string) {
  console.error(`\x1b[31m  ✗ ${msg}\x1b[0m`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Could not allocate test port")));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

function waitForPort(port: number, timeout = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout;

    function attempt() {
      if (Date.now() > deadline) {
        reject(new Error(`Port ${port} not ready after ${timeout}ms`));
        return;
      }

      const ws = new WebSocket(`ws://127.0.0.1:${port}`);

      ws.on("open", () => {
        ws.close();
        resolve();
      });

      ws.on("error", () => {
        setTimeout(attempt, 500);
      });
    }

    attempt();
  });
}

// ── Process management ──────────────────────────────────────────────

const processes: ChildProcess[] = [];
const processLines: Record<string, string[]> = {};

function startProcess(
  name: string,
  cmd: string,
  args: string[],
  cwd: string,
  env?: Record<string, string>,
): ChildProcess {
  log(name, `Starting: ${cmd} ${args.join(" ")}`);

  const proc = spawn(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["pipe", "pipe", "pipe"],
  });

  proc.stdout?.on("data", (d) => {
    const lines = d.toString().split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) {
        (processLines[name] ??= []).push(trimmed);
        log(name, trimmed);
      }
    }
  });

  proc.stderr?.on("data", (d) => {
    const lines = d.toString().split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.includes("DeprecationWarning")) {
        (processLines[name] ??= []).push(trimmed);
        err(name, trimmed);
      }
    }
  });

  proc.on("exit", (code) => {
    log(name, `Exited with code ${code}`);
  });

  processes.push(proc);
  return proc;
}

async function waitForCondition(
  label: string,
  predicate: () => boolean,
  timeout = 10000,
): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(250);
  }
  fail(label);
  failed++;
  return false;
}

function cleanup() {
  log("CLEANUP", `Stopping ${processes.length} process(es)`);
  for (const p of processes) {
    try {
      p.kill("SIGTERM");
    } catch {
      // already dead
    }
  }
}

async function cleanupProcesses(): Promise<void> {
  cleanup();
  await Promise.all(
    processes.map(
      (p) =>
        new Promise<void>((resolve) => {
          if (p.exitCode !== null || p.signalCode !== null) {
            resolve();
            return;
          }
          const timeout = setTimeout(resolve, 3000);
          p.once("exit", () => {
            clearTimeout(timeout);
            resolve();
          });
        }),
    ),
  );
}

// ── Test cases ──────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

async function testSensorPipeline(): Promise<void> {
  log("TEST", "── Sensor event pipeline ──");

  // Connect as a sensor client
  const ws = new WebSocket(`ws://127.0.0.1:${SYNAPSE_PORT}`);

  return new Promise((resolve) => {
    let sentEvent = false;

    ws.on("open", () => {
      ok("Sensor client connected to Hands");
      const event = {
        type: "SENSOR_EVENT",
        event_type: "terminal_error",
        data: {
          error: E2E_MARKER,
          output: "Error: MODULE_NOT_FOUND",
          matches: ["\\berror:"],
        },
        confidence: 0.85,
        timestamp: Date.now() / 1000,
      };

      ws.send(JSON.stringify(event));
      sentEvent = true;
      ok("Sent test SENSOR_EVENT (terminal_error)");
      passed += 2;

      setTimeout(async () => {
        const atriumLines = processLines.ATRIUM ?? [];
        const lifecycleOk = await waitForCondition(
          "Lifecycle did not reach SENSOR_EVENT -> THINKING -> successful action",
          () => {
            const sawSensor = atriumLines.some((line) =>
              line.includes("Sensor: terminal_error"),
            );
            const sawThinking = atriumLines.some(
              (line) => line.includes("OBSERVING") && line.includes("THINKING"),
            );
            const sawIdle = atriumLines.some(
              (line) => line.includes("ACTING") && line.includes("IDLE"),
            );
            const synapseSuccess =
              atriumLines.some((line) => line.includes("Sent TASK_REQUEST")) &&
              atriumLines.some(
                (line) =>
                  line.includes("RESULT for") && line.includes("success=true"),
              );
            const skillSuccess =
              atriumLines.some((line) => line.includes("Skill dispatch:")) &&
              atriumLines.some(
                (line) => line.includes("Succeeded:") && line.includes("Skill"),
              );

            return (
              sawSensor &&
              sawThinking &&
              sawIdle &&
              (synapseSuccess || skillSuccess)
            );
          },
        );
        if (lifecycleOk) {
          ok("Observed full Atrium lifecycle and successful action");
          passed++;
        }
        ws.close();
        resolve();
      }, 3000);
    });

    ws.on("error", (e) => {
      fail(`Sensor connection failed: ${e.message}`);
      failed++;
      resolve();
    });

    // Timeout
    setTimeout(() => {
      if (!sentEvent) {
        fail("Sensor event was not sent within timeout");
        failed++;
      }
      ws.close();
      resolve();
    }, 10000);
  });
}

async function testSqliteLifecycle(): Promise<void> {
  log("TEST", "── SQLite lifecycle ──");

  if (!existsSync(MEMORY_DB)) {
    fail(`SQLite database not found at ${MEMORY_DB}`);
    failed++;
    return;
  }

  const SQL = await initSqlJs();
  const db = new SQL.Database(readFileSync(MEMORY_DB));

  const eventRows = db.exec(
    `SELECT event_id FROM events
     WHERE event_type = 'terminal_error' AND data LIKE '%${E2E_MARKER}%'
     LIMIT 1`,
  );
  const taskRows = db.exec(
    `SELECT task_id, type FROM tasks
     WHERE state = 'completed'
       AND updated_at >= datetime('now', '-10 minutes')
       AND (payload LIKE '%${E2E_MARKER}%' OR result LIKE '%${E2E_MARKER}%')
     ORDER BY updated_at DESC
     LIMIT 1`,
  );

  if (eventRows.length > 0) {
    ok("SQLite recorded the fake SENSOR_EVENT");
    passed++;
  } else {
    fail("SQLite did not record the fake SENSOR_EVENT");
    failed++;
  }

  if (taskRows.length > 0) {
    ok("SQLite recorded the completed action lifecycle");
    passed++;
  } else {
    fail("SQLite did not record the completed action lifecycle");
    failed++;
  }
}

async function testAegisRelay(): Promise<void> {
  log("TEST", "── Aegis relay ──");

  try {
    const ws = new WebSocket(`ws://127.0.0.1:${AEGIS_PORT}`);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        fail("Aegis relay connection timeout");
        failed++;
        ws.close();
        resolve();
      }, 5000);

      ws.on("open", () => {
        ok("Connected to Aegis relay");
        passed++;

        // Subscribe
        ws.send(JSON.stringify({ type: "AEGIS_SUBSCRIBE" }));
      });

      ws.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());

        if (msg.type === "HEALTH_SNAPSHOT") {
          ok(
            `Health snapshot received — state=${msg.data?.dashboard?.atriumState}`,
          );
          passed++;

          // Test pause command
          ws.send(JSON.stringify({ type: "AEGIS_COMMAND", command: "pause" }));
        }

        if (msg.type === "PAUSE_STATUS") {
          if (msg.paused === true) {
            ok("Pause command worked");
            passed++;

            // Resume
            ws.send(
              JSON.stringify({ type: "AEGIS_COMMAND", command: "resume" }),
            );
          } else if (msg.paused === false) {
            ok("Resume command worked");
            passed++;
            clearTimeout(timeout);
            ws.close();
            resolve();
          }
        }
      });

      ws.on("error", (e) => {
        fail(`Aegis relay error: ${e.message}`);
        failed++;
        clearTimeout(timeout);
        resolve();
      });
    });
  } catch (e) {
    fail(`Aegis relay test failed: ${e}`);
    failed++;
  }
}

async function testHandsStatus(): Promise<void> {
  log("TEST", "── Hands connectivity ──");

  try {
    await waitForPort(SYNAPSE_PORT, 5000);
    ok("Hands WebSocket server is listening");
    passed++;
  } catch {
    fail("Hands WebSocket server not reachable");
    failed++;
  }
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log("\n\x1b[1m🧪 Parix End-to-End Integration Test\x1b[0m\n");

  SYNAPSE_PORT = await getFreePort();
  do {
    AEGIS_PORT = await getFreePort();
  } while (AEGIS_PORT === SYNAPSE_PORT);
  log("BOOT", `Using isolated ports: synapse=${SYNAPSE_PORT}, aegis=${AEGIS_PORT}`);

  mkdirSync(DATA_DIR, { recursive: true });

  // 1. Start Hands
  const python = process.platform === "win32" ? "python" : "python3";
  startProcess("HANDS", python, ["-m", "hands.main"], ROOT, {
    PYTHONUNBUFFERED: "1",
    PYTHONPATH: ROOT,
    PARIX_HOME: E2E_HOME,
    PARIX_WS_HOST: "127.0.0.1",
    PARIX_WS_PORT: String(SYNAPSE_PORT),
    PARIX_A11Y_DISABLED: "1",
    PARIX_NEUROSYMBOLIC_DISABLED: "1",
  });

  // Wait for Hands to be ready
  log("BOOT", "Waiting for Hands...");
  try {
    await waitForPort(SYNAPSE_PORT, 15000);
    ok("Hands is ready");
    passed++;
  } catch {
    fail("Hands failed to start");
    failed++;
    cleanup();
    process.exit(1);
  }

  // 2. Build + start Atrium
  log("BOOT", "Building Atrium...");

  // Set up a mock profile for E2E testing
  const parixHome = E2E_HOME;
  if (!existsSync(parixHome)) mkdirSync(parixHome, { recursive: true });
  const profile = createDefaultProfile("personal");
  profile.identity = {
    name: "E2E User",
    computerUse: "Testing",
    mainWorkflows: [],
  };
  profile.llm = {
    provider: "mock",
    model: "mock",
    authMethod: "local",
    authProfileId: null,
    connectionVerified: true,
    verifiedAt: new Date().toISOString(),
  };
  profile.channels = {
    primary: "aegis",
    enabled: ["aegis", "console"],
    settings: {
      ...profile.channels.settings,
      aegis: {
        kind: "voice",
        enabled: "true",
        autoStart: "true",
        wakeWord: "aegis",
      },
    },
  };
  profile.permissions = {
    terminalErrors: true,
    activeWindow: true,
    gitState: true,
    clipboardDetection: false,
    browserTabs: false,
    systemHealth: true,
  };
  profile.personality = {
    agentName: "E2E Parix",
    style: "friendly",
    vibe: "balanced",
    interruptionLevel: "moderate",
    autonomyLevel: "safe-auto-fix",
  };
  if (isPersonalProfile(profile)) {
    profile.agentProfile = {
      ...profile.agentProfile,
      userName: "E2E User",
      userDescription: "Testing",
      agentName: "E2E Parix",
      allowedChannels: ["aegis", "console"],
    };
  }

  const validation = validateProfile(profile);
  if (!validation.valid) {
    throw new Error(`Generated invalid E2E profile: ${validation.errors.join(", ")}`);
  }

  writeFileSync(resolve(parixHome, "profile.json"), JSON.stringify(profile));
  process.env.PARIX_HOME = parixHome;

  const tscCli = resolve(ROOT, "node_modules/typescript/bin/tsc");
  const buildResult = spawn(process.execPath, [tscCli, "-b"], {
    cwd: ATRIUM_DIR,
    stdio: "inherit",
  });

  await new Promise<void>((resolve) => {
    buildResult.on("exit", (code) => {
      if (code === 0) {
        ok("Atrium built");
        passed++;
      } else {
        fail(`Atrium build failed (code=${code})`);
        failed++;
      }
      resolve();
    });
  });

  if (failed > 0) {
    cleanup();
    printSummary();
    process.exit(1);
  }

  // Check dist/index.js exists
  const distPath = resolve(ATRIUM_DIR, "dist/index.js");
  if (!existsSync(distPath)) {
    fail(`Atrium dist not found at ${distPath}`);
    failed++;
    cleanup();
    printSummary();
    process.exit(1);
  }

  startProcess("ATRIUM", "node", [distPath], ATRIUM_DIR, {
    NODE_ENV: "test",
    PARIX_HOME: process.env.PARIX_HOME,
    PARIX_DATA_DIR: DATA_DIR,
    HANDS_WS_URL: `ws://127.0.0.1:${SYNAPSE_PORT}`,
    PARIX_AEGIS_RELAY_PORT: String(AEGIS_PORT),
  });

  // Wait for Atrium to connect (it connects to Hands)
  log("BOOT", "Waiting for Atrium to boot...");
  await sleep(4000);

  const profileRoutingOk = await waitForCondition(
    "Atrium did not select the mock LLM provider from .parix-e2e/profile.json",
    () =>
      (processLines.ATRIUM ?? []).some(
        (line) =>
          line.includes("LLM providers:") &&
          line.includes("mock") &&
          line.includes("profile=mock -> mock"),
      ),
    5000,
  );
  if (profileRoutingOk) {
    ok("Atrium selected MockAdapter from the E2E profile");
    passed++;
  }

  // Wait for Aegis relay
  try {
    await waitForPort(AEGIS_PORT, 8000);
    ok("Aegis relay is ready");
    passed++;
  } catch {
    fail("Aegis relay not reachable");
    failed++;
  }

  // 3. Run tests
  console.log("\n\x1b[1m── Running tests ──\x1b[0m\n");

  await testHandsStatus();
  await testSensorPipeline();
  await testAegisRelay();

  // 4. Cleanup
  console.log("");
  await cleanupProcesses();
  await sleep(500);

  await testSqliteLifecycle();

  printSummary();
  process.exitCode = failed > 0 ? 1 : 0;
}

function printSummary() {
  console.log(`\n\x1b[1m── Summary ──\x1b[0m`);
  console.log(`  \x1b[32m${passed} passed\x1b[0m`);
  if (failed > 0) {
    console.log(`  \x1b[31m${failed} failed\x1b[0m`);
  }
  console.log("");
}

process.on("SIGINT", () => {
  cleanup();
  process.exit(1);
});

process.on("SIGTERM", () => {
  cleanup();
  process.exit(1);
});

main().catch((e) => {
  err("FATAL", String(e));
  cleanup();
  process.exit(1);
});
