import { mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { initDb, initMemoryStore, lastEventId, closeDb } from "./memory/db.js";
import { SynapseClient } from "./synapse/client.js";
import { AtriumEngine } from "./intelligence/council.js";
import { initAuditChain, verifyChain } from "./intelligence/audit.js";
import { getSkillStats } from "./intelligence/skillcache.js";
import { getStats as getDlqStats } from "./intelligence/deadletter.js";
import "./channels/index.js";
import { registerTelegramEngine } from "./channels/telegram.js";
import { startInboundAgent } from "./channels/agent-inbound.js";
import { bootstrapScheduler } from "./scheduler/bootstrap.js";
import { McpManager, loadMcpConfig } from "./mcp/manager.js";
import {
  registerStateGetter,
  resumeFromCheckpoint,
  startWatchdogCron,
  type WorldStateCheckpoint,
} from "./intelligence/watchdog.js";
import {
  pause as pauseAgent,
  resume as resumeAgent,
  getStatus as getPauseStatus,
  toggle as togglePauseState,
} from "./intelligence/pause.js";
import {
  getRecentExplanations,
  formatExplanation,
} from "./intelligence/explainability.js";
import { startAegisRelay } from "./aegis/relay.js";
import { LLMRouter } from "./llm/router.js";
import { createProfileAwareLLMSelection } from "./llm/registry.js";
import { loadAndApplyProfile, getAgentName } from "./config/profile.js";
import { loadFromDb } from "./cognition/horizon.js";
import { loadNarratives } from "./cognition/horizon-store.js";
import { loadTrees } from "./cognition/planner/index.js";
import { loadActivePlanTrees } from "./cognition/planner/store.js";
import { loadSkills, getRegistryStats } from "./intelligence/skill-registry.js";
import { initDocsRouter, loadBootDocs } from "./docs/index.js";
import { seedDefaultBenchmarks } from "./nexus/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../..");
const DATA_DIR = process.env.PARIX_DATA_DIR
  ? resolve(process.env.PARIX_DATA_DIR)
  : resolve(__dirname, "../../data");
const SKILLS_DIR = resolve(__dirname, "../../skills");

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });

  console.log("[ATRIUM] Initializing...");
  await initDb(resolve(DATA_DIR, "memory.db"));
  if (process.env.DATABASE_URL || process.env.SUPABASE_DB_URL) {
    const store = await initMemoryStore({
      databaseUrl: process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL,
    });
    console.log(`[ATRIUM] Enterprise memory store initialized (${store.kind})`);
  }
  console.log("[ATRIUM] Database initialized");

  const narrativeRows = loadNarratives();
  loadFromDb(narrativeRows);
  console.log(`[BOOT] Loaded ${narrativeRows.length} active narratives`);

  const activePlans = loadActivePlanTrees();
  loadTrees(activePlans);
  console.log(`[BOOT] Loaded ${activePlans.length} active plan trees`);

  loadSkills(SKILLS_DIR);
  const registryStats = getRegistryStats();
  console.log(
    `[BOOT] Loaded ${registryStats.totalSkills} skill manifest(s), ${registryStats.totalTriggers} trigger(s)`,
  );

  // ─── Documentation Router ──────────────────────────────────────
  initDocsRouter(PROJECT_ROOT);
  const bootDocs = loadBootDocs();
  console.log(`[BOOT] Routed ${bootDocs.length} boot documents (SOUL, IDENTITY, USER, MEMORY, HEARTBEAT, TOOLS)`);

  // ─── Load profile (Hatchery config) ─────────────────────────────
  const profileResult = loadAndApplyProfile();
  if (!profileResult.loaded) {
    console.log(`[ATRIUM] ${profileResult.reason}`);
    console.log("[ATRIUM] Exiting — agent will not start without onboarding.");
    closeDb();
    process.exit(0);
  }
  console.log(
    `[ATRIUM] Agent: "${getAgentName()}" (${profileResult.profile!.mode} mode)`,
  );

  // Init subsystems
  initAuditChain();
  const chainStatus = verifyChain();
  if (!chainStatus.valid) {
    console.error(`[ATRIUM] Audit chain broken at id=${chainStatus.brokenAt}`);
  } else {
    console.log("[ATRIUM] Audit chain verified");
  }

  // ─── Nexus — Beyonder Self-Improvement Layer ─────────────────
  seedDefaultBenchmarks();
  console.log("[BOOT] Nexus evolutionary architecture initialized");

  const synapse = new SynapseClient();
  const engine = new AtriumEngine(synapse);
  registerTelegramEngine(engine);
  // Route inbound messages from every channel through the act-first engine.
  startInboundAgent(engine);
  // Start the scheduler so heartbeat, maintenance jobs, and user cron tasks run.
  bootstrapScheduler(engine);

  // Connect configured MCP servers so the engine can dispatch `mcp` tool calls.
  const mcpManager = new McpManager();
  engine.setMcpManager(mcpManager);
  const mcpConfig = loadMcpConfig(PROJECT_ROOT);
  if (Object.keys(mcpConfig).length > 0) {
    await mcpManager.connect(mcpConfig);
    console.log(
      `[BOOT] MCP: ${mcpManager.listTools().length} tool(s) from ${Object.keys(mcpConfig).length} server(s)`,
    );
  } else {
    console.log("[BOOT] MCP: no servers configured (mcp.servers.json absent)");
  }

  // ─── LLM Router (v0.2 planning) ───────────────────────────────
  try {
    const llmSelection = createProfileAwareLLMSelection(profileResult.profile);
    const providers = llmSelection.providers;

    if (providers.length > 0) {
      const router = new LLMRouter({
        providers,
        routes: llmSelection.routes,
        defaultRoute: llmSelection.defaultRoute,
      });
      engine.setLLMRouter(router);
      synapse.setLLMRouter(router);
      const profileSelection = llmSelection.requestedProviderId
        ? ` | profile=${llmSelection.requestedProviderId}${llmSelection.selectedProviderId ? ` -> ${llmSelection.selectedProviderId}` : " (unavailable)"}`
        : "";
      console.log(
        `[ATRIUM] LLM providers: ${providers.map((p) => p.id).join(", ")}${profileSelection}`,
      );
    } else {
      console.log(
        "[ATRIUM] No LLM API keys found - using local rule-based planning",
      );
    }
  } catch (err) {
    console.log(
      "[ATRIUM] LLM router init skipped:",
      err instanceof Error ? err.message : err,
    );
  }

  registerStateGetter(
    (): WorldStateCheckpoint => ({
      atrium_state: engine.getState(),
      pending_tasks: [],
      last_event_id: lastEventId(),
      hands_status: synapse.getStatus(),
      timestamp: Date.now(),
    }),
  );

  const checkpoint = resumeFromCheckpoint();
  if (checkpoint) {
    engine.setState(checkpoint.atrium_state as any);
    console.log(
      `[ATRIUM] Resumed from checkpoint — state=${engine.getState()}`,
    );
  } else {
    console.log("[ATRIUM] Fresh start — no checkpoint found");
  }

  // ─── Synapse event routing → Atrium engine ────────────────────
  synapse.on("state_change", (status) => {
    console.log(`[ATRIUM] Hands status: ${status}`);
  });

  synapse.on("sensor_event", (event) => {
    console.log(
      `[ATRIUM] Sensor: ${event.event_type} (confidence=${event.confidence})`,
    );
    engine.ingestSensorEvent(event);
  });

  synapse.on("silent_intent", (event) => {
    console.log(
      `[ATRIUM] Silent intent: ${event.intent_type} (confidence=${event.confidence})`,
    );
    engine.ingestSilentIntent(event);
  });

  synapse.on("reboot_sync", () => {
    console.log("[ATRIUM] Hands rebooted — world state pushed");
  });

  synapse.on("pause_toggle", () => {
    console.log("[ATRIUM] Pause toggle requested via global hotkey");
    const isPaused = togglePauseState();
    if (!isPaused) {
      engine.onResume();
    }
  });

  synapse.on("error", (err) => {
    console.error("[ATRIUM] Synapse error:", err.message);
  });

  // ─── Engine event logging ─────────────────────────────────────
  engine.on("state_change", (from, to) => {
    console.log(`[ATRIUM] ${from} → ${to}`);
  });

  engine.on("action_blocked", (plan, reason) => {
    console.log(`[ATRIUM] Blocked: ${reason} (plan=${plan.reasoning})`);
  });

  engine.on("action_executed", (plan, success) => {
    console.log(
      `[ATRIUM] ${success ? "Succeeded" : "Failed"}: ${plan.reasoning}`,
    );
  });

  engine.on("error", (err) => {
    console.error("[ATRIUM] Error:", err.message);
  });

  // ─── Start systems ────────────────────────────────────────────
  const watchdogInterval = startWatchdogCron(60_000);

  // Start Aegis relay for dashboard UI
  const aegisWss = startAegisRelay(engine, synapse);

  synapse.connect();
  console.log("[ATRIUM] Synapse connecting...");
  console.log(`[ATRIUM] State: ${engine.getState()}`);
  console.log("[ATRIUM] Constitution active");
  console.log("[ATRIUM] Governor active");
  console.log("[ATRIUM] Audit ledger active");
  console.log("[ATRIUM] Skill cache active");
  console.log("[ATRIUM] Dead letter queue active");
  console.log("[ATRIUM] Notification dispatcher active");
  console.log("[ATRIUM] Episodic memory active (v0.2)");
  console.log("[ATRIUM] Context fusion active (v0.2)");
  console.log("[ATRIUM] Surprise tracking active (v0.2)");

  // Log subsystem stats
  const skillStats = getSkillStats();
  const dlqStats = getDlqStats();
  console.log(
    `[ATRIUM] Skills: ${skillStats.totalPatterns} patterns (${(skillStats.hitRate * 100).toFixed(0)}% hit rate)`,
  );
  console.log(
    `[ATRIUM] DLQ: ${dlqStats.pending} pending, ${dlqStats.exhausted} exhausted`,
  );

  // ─── IPC commands (stdin) ──────────────────────────────────────
  process.stdin.setEncoding("utf-8");
  process.stdin.on("data", (input: string) => {
    const cmd = input.trim().toLowerCase();

    if (cmd === "pause") {
      pauseAgent("user_stdin");
      console.log("[ATRIUM] Agent paused");
    } else if (cmd === "resume") {
      resumeAgent();
      engine.onResume();
      console.log("[ATRIUM] Agent resumed");
    } else if (cmd === "status") {
      const ps = getPauseStatus();
      console.log(
        `[ATRIUM] State: ${engine.getState()} | Paused: ${ps.paused} | Queue: ${engine.getQueueDepth()}`,
      );
    } else if (cmd === "explain" || cmd === "why") {
      const exp = engine.explain();
      if (exp) {
        console.log(formatExplanation(exp));
      } else {
        console.log("[ATRIUM] No recent actions to explain");
      }
    } else if (cmd.startsWith("explain ")) {
      const taskId = cmd.slice(8).trim();
      const exp = engine.explain(taskId);
      if (exp) {
        console.log(formatExplanation(exp));
      } else {
        console.log(`[ATRIUM] No action found for task ${taskId}`);
      }
    } else if (cmd === "history") {
      const exps = getRecentExplanations(5);
      if (exps.length === 0) {
        console.log("[ATRIUM] No action history");
      } else {
        exps.forEach((e, i) => {
          console.log(`\n── Action ${i + 1} ──`);
          console.log(formatExplanation(e));
        });
      }
    }
  });

  // ─── Shutdown ──────────────────────────────────────────────────
  function shutdown() {
    console.log("[ATRIUM] Shutting down...");
    clearInterval(watchdogInterval);
    aegisWss.close();
    engine.destroy();
    synapse.disconnect();
    closeDb();
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[ATRIUM] Fatal:", err);
  process.exit(1);
});
