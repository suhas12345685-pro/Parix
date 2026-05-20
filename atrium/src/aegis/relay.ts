/**
 * Aegis Relay — WebSocket server on port 8766 that streams
 * Atrium state to the Aegis dashboard UI.
 *
 * Protocol:
 *   Client → Server: AEGIS_SUBSCRIBE, AEGIS_COMMAND (pause/resume/explain)
 *   Server → Client: HEALTH_SNAPSHOT, STATE_CHANGE, SENSOR_EVENT, AUDIT_ENTRY, PAUSE_STATUS, QUEUE_UPDATE
 */

import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { type AtriumEngine } from "../intelligence/council.js";
import { type SynapseClient } from "../synapse/client.js";
import { getRecentAudit } from "../intelligence/audit.js";
import { getSkillStats } from "../intelligence/skillcache.js";
import { getStats as getDlqStats } from "../intelligence/deadletter.js";
import { getDb, getRecentEvents } from "../memory/db.js";
import {
  pause as pauseAgent,
  resume as resumeAgent,
  getStatus as getPauseStatus,
} from "../intelligence/pause.js";
import {
  explainAction,
  formatExplanation,
} from "../intelligence/explainability.js";
import { governor as governorInstance } from "../intelligence/governor.js";
import { getEpisodeStats } from "../intelligence/episodes.js";
import {
  getRecentSituations,
  getCurrentSignals,
} from "../intelligence/situations.js";
import {
  getSurpriseStats,
  getUnactionedSurprises,
} from "../intelligence/surprises.js";
import { getProfile, saveRuntimeChannelConfig } from "../config/profile.js";
import { getLastCognitiveSnapshot } from "../cognition/index.js";
import { getAttentionStats } from "../cognition/attention.js";
import { getAllActiveTrees, getProgress } from "../cognition/planner/index.js";
import { getActiveNarratives } from "../cognition/horizon.js";
import { getLatestAccessibility } from "../synapse/a11y-handler.js";
import { loadSkills } from "../intelligence/skill-registry.js";
import { registerUserCreatedSkillPermissions } from "../intelligence/skill-permissions.js";

import protocol from "../../../shared/protocol.json" with { type: "json" };

const AEGIS_PORT = protocol.ports.aegis_relay;

const clients = new Set<WebSocket>();
let engine: AtriumEngine;
let synapse: SynapseClient;
let startTime = Date.now();
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../../..");
const AGENT_SKILLS_DIR = resolve(PROJECT_ROOT, ".agents/skills");
const TASK_SKILLS_DIR = resolve(PROJECT_ROOT, "skills");

/**
 * Start the Aegis relay WebSocket server.
 */
export function startAegisRelay(
  atriumEngine: AtriumEngine,
  synapseClient: SynapseClient,
): WebSocketServer {
  engine = atriumEngine;
  synapse = synapseClient;
  startTime = Date.now();

  const healthServer = createServer((req, res) => {
    if (req.url === "/healthz" || req.url === "/health") {
      const snapshot = buildHealthSnapshot();
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          ok: true,
          service: "atrium",
          state: (snapshot.dashboard as Record<string, unknown>).atriumState,
          handsStatus: (snapshot.dashboard as Record<string, unknown>)
            .handsStatus,
          uptime: (snapshot.dashboard as Record<string, unknown>).uptime,
        }),
      );
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  });
  const wss = new WebSocketServer({ server: healthServer });

  wss.on("connection", (ws) => {
    clients.add(ws);
    console.log(`[AEGIS] Dashboard connected (${clients.size} clients)`);

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        handleClientMessage(ws, msg);
      } catch {
        // ignore
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
      console.log(`[AEGIS] Dashboard disconnected (${clients.size} clients)`);
    });
  });

  // Forward engine events to all dashboard clients
  wireEngineEvents();

  // Periodic health snapshot every 5s
  const snapshotInterval = setInterval(() => {
    broadcastHealthSnapshot();
  }, 5000);

  wss.on("close", () => {
    clearInterval(snapshotInterval);
    healthServer.close();
  });

  healthServer.listen(AEGIS_PORT);
  console.log(`[AEGIS] Relay server listening on ws://localhost:${AEGIS_PORT}`);
  return wss;
}

function handleClientMessage(
  ws: WebSocket,
  msg: Record<string, unknown>,
): void {
  switch (msg.type) {
    case "AEGIS_SUBSCRIBE":
      // Send immediate snapshot
      sendTo(ws, { type: "HEALTH_SNAPSHOT", data: buildHealthSnapshot() });
      break;

    case "AEGIS_COMMAND":
      handleCommand(ws, msg);
      break;
  }
}

function handleCommand(ws: WebSocket, msg: Record<string, unknown>): void {
  const cmd = String(msg.command ?? "");

  switch (cmd) {
    case "pause":
      pauseAgent("aegis_dashboard");
      broadcast({ type: "PAUSE_STATUS", ...getPauseStatus() });
      break;

    case "resume":
      resumeAgent();
      engine.onResume();
      broadcast({ type: "PAUSE_STATUS", ...getPauseStatus() });
      break;

    case "explain": {
      const taskId = msg.taskId as string | undefined;
      const explanation = explainAction(taskId);
      sendTo(ws, {
        type: "EXPLAIN_RESULT",
        explanation: explanation ? formatExplanation(explanation) : null,
        raw: explanation,
      });
      break;
    }

    case "flush":
      engine.flush();
      broadcast({ type: "QUEUE_UPDATE", depth: engine.getQueueDepth() });
      break;

    case "save_channels":
      saveChannelSelection(msg);
      broadcastHealthSnapshot();
      sendTo(ws, { type: "CHANNELS_SAVED", channels: getChannelSnapshot() });
      break;

    case "save_cron_task":
      saveCronTask(msg);
      broadcastHealthSnapshot();
      sendTo(ws, { type: "CRON_TASKS_SAVED", cronTasks: getCronTasks() });
      break;

    case "toggle_cron_task":
      toggleCronTask(msg);
      broadcastHealthSnapshot();
      sendTo(ws, { type: "CRON_TASKS_SAVED", cronTasks: getCronTasks() });
      break;

    case "delete_cron_task":
      deleteCronTask(msg);
      broadcastHealthSnapshot();
      sendTo(ws, { type: "CRON_TASKS_SAVED", cronTasks: getCronTasks() });
      break;

    case "create_skill":
      createSkill(msg);
      broadcastHealthSnapshot();
      sendTo(ws, {
        type: "SKILL_CREATED",
        installedSkills: getInstalledSkills(),
      });
      break;

    case "init_workspace_files":
      sendTo(ws, {
        type: "WORKSPACE_FILES_READY",
        workspaceFiles: initWorkspaceFiles(),
      });
      break;

    default:
      sendTo(ws, { type: "ERROR", message: `Unknown command: ${cmd}` });
  }
}

function buildHealthSnapshot(): Record<string, unknown> {
  const pauseStatus = getPauseStatus();
  const skillStats = getSkillStats();
  const dlqStats = getDlqStats();
  const lastCognition = getLastCognitiveSnapshot();
  const attention = getAttentionStats();
  const activePlans = getAllActiveTrees();
  const activePlan = activePlans[0];

  return {
    dashboard: {
      atriumState: engine.getState(),
      paused: pauseStatus.paused,
      pausedAt: pauseStatus.pausedAt,
      handsStatus: synapse.getStatus(),
      queueDepth: engine.getQueueDepth(),
      uptime: Date.now() - startTime,
      lastUpdate: Date.now(),
    },
    skills: skillStats,
    dlq: dlqStats,
    cognition: {
      attention: {
        focus: attention.focus,
        strength: attention.focusStrength,
        admitRate: attention.admitRate,
        suppressedCount: attention.suppressedCount,
      },
      metacognition: {
        cognitiveLoad: lastCognition?.metacognition?.cognitiveLoad ?? 0,
        strategy: lastCognition?.metacognition?.strategy,
        reason: lastCognition?.metacognition?.reason,
      },
      activePlan: activePlan
        ? {
            id: activePlan.id,
            rootGoal: activePlan.rootGoal,
            status: activePlan.status,
            progress: getProgress(activePlan),
            nodes: activePlan.nodes.map((node) => ({
              id: node.id,
              goal: node.goal,
              status: node.status,
              retries: node.retries,
              maxRetries: node.maxRetries,
            })),
          }
        : null,
      activeNarratives: getActiveNarratives().map((narrative) => {
        let failureStreak = 0;
        for (const attempt of [...narrative.attempts].reverse()) {
          if (attempt.outcome !== "failure") break;
          failureStreak += 1;
        }
        return {
          id: narrative.id,
          goal: narrative.goal,
          summary: narrative.summary,
          status: narrative.status,
          attemptCount: narrative.attempts.length,
          failureStreak,
          lastActivityAt: narrative.lastActivityAt,
          attempts: narrative.attempts,
        };
      }),
      accessibility: (() => {
        const a11y = getLatestAccessibility();
        if (!a11y) return null;
        return {
          focusedApp: a11y.focusedApp,
          backendUsed: a11y.backendUsed,
          confidence: a11y.confidence,
          ts: a11y.ts,
          focusedElement: a11y.focusedElement
            ? {
                role: a11y.focusedElement.role,
                name: a11y.focusedElement.name,
                state: a11y.focusedElement.state,
              }
            : null,
        };
      })(),
    },
    governor: (() => {
      const stats = governorInstance.getStats();
      return {
        minuteCount: stats.lastMinute,
        hourCount: stats.lastHour,
        dailyTokens: 0, // TODO: query token_usage table
        dailyLimit: 100000,
      };
    })(),
    recentEvents: getRecentEvents(20).map((e: Record<string, unknown>) => ({
      id: e.event_id,
      eventType: e.event_type,
      data: safeJsonParse(String(e.data ?? "{}")),
      confidence: e.confidence,
      timestamp: e.timestamp,
    })),
    // v0.2 stats
    episodes: getEpisodeStats(),
    situations: getRecentSituations(5).map((s) => ({
      id: s.id,
      inferred: s.inferred,
      confidence: s.confidence,
      userState: s.userState,
      ts: s.ts,
    })),
    surprises: getSurpriseStats(),
    unactionedSurprises: getUnactionedSurprises().slice(0, 5),
    activeSignals: getCurrentSignals().length,
    channels: getChannelSnapshot(),
    cronTasks: getCronTasks(),
    installedSkills: getInstalledSkills(),
    workspaceFiles: getWorkspaceFiles(),

    recentAudit: getRecentAudit(20).map((a: Record<string, unknown>) => ({
      id: a.id,
      actor: a.actor,
      action: a.action,
      taskId: a.task_id,
      payload: a.payload ? safeJsonParse(String(a.payload)) : null,
      prevHash: a.prev_hash,
      thisHash: a.this_hash,
      ts: a.ts,
    })),
  };
}

function getCronTasks(): Array<Record<string, unknown>> {
  const tasks: Array<Record<string, unknown>> = [];
  try {
    const stmt = getDb().prepare(
      "SELECT task_id, title, prompt, interval_minutes, enabled, source FROM cron_tasks ORDER BY created_at DESC",
    );
    while (stmt.step()) {
      const [taskId, title, prompt, intervalMinutes, enabled, source] =
        stmt.get();
      tasks.push({
        taskId: String(taskId),
        title: String(title),
        prompt: String(prompt),
        intervalMinutes: Number(intervalMinutes),
        enabled: Number(enabled) === 1,
        source: String(source ?? "hatchery"),
      });
    }
    stmt.free();
  } catch {
    return [];
  }
  return tasks;
}

function saveCronTask(msg: Record<string, unknown>): void {
  const title = String(msg.title ?? "").trim();
  const prompt = String(msg.prompt ?? "").trim();
  if (!title || !prompt) return;
  const intervalMinutes = Math.max(
    5,
    Math.min(1440, Number(msg.intervalMinutes ?? 60)),
  );
  const taskId = String(msg.taskId ?? `cron_${Date.now()}`);
  getDb().run(
    `INSERT INTO cron_tasks (task_id, title, prompt, interval_minutes, enabled, source)
     VALUES (?, ?, ?, ?, 1, 'hatchery')
     ON CONFLICT(task_id) DO UPDATE SET
       title = excluded.title,
       prompt = excluded.prompt,
       interval_minutes = excluded.interval_minutes,
       enabled = 1,
       updated_at = CURRENT_TIMESTAMP`,
    [taskId, title, prompt, intervalMinutes],
  );
}

function toggleCronTask(msg: Record<string, unknown>): void {
  const taskId = String(msg.taskId ?? "");
  if (!taskId) return;
  getDb().run(
    "UPDATE cron_tasks SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE task_id = ?",
    [msg.enabled ? 1 : 0, taskId],
  );
}

function deleteCronTask(msg: Record<string, unknown>): void {
  const taskId = String(msg.taskId ?? "");
  if (!taskId) return;
  getDb().run("DELETE FROM cron_tasks WHERE task_id = ?", [taskId]);
}

function getInstalledSkills(): Array<Record<string, unknown>> {
  if (!existsSync(AGENT_SKILLS_DIR)) return [];
  return readdirSync(AGENT_SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const skillPath = join(AGENT_SKILLS_DIR, entry.name);
      const skillFile = join(skillPath, "SKILL.md");
      const stats = statSync(skillPath);
      return {
        id: entry.name,
        path: skillPath,
        description: readSkillDescription(skillFile),
        hasScripts: existsSync(join(skillPath, "scripts")),
        hasReferences: existsSync(join(skillPath, "references")),
        hasTemplates: existsSync(join(skillPath, "templates")),
        source: getSkillSource(entry.name),
        updatedAt: stats.mtimeMs,
      };
    });
}

function readSkillDescription(skillFile: string): string {
  if (!existsSync(skillFile)) return "";
  const raw = readFileSync(skillFile, "utf-8");
  const frontmatter = raw.match(/^---\s*([\s\S]*?)\s*---/);
  const descriptionLine = frontmatter?.[1]
    .split(/\r?\n/)
    .find((line) => line.trim().startsWith("description:"));
  const description = descriptionLine
    ?.replace(/^description:\s*/i, "")
    .trim()
    .replace(/^["']|["']$/g, "");
  if (description) return description;

  return raw
    .replace(/^---\s*[\s\S]*?\s*---/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#")) ?? "";
}

function getSkillSource(skillId: string): string {
  try {
    const stmt = getDb().prepare(
      "SELECT source FROM skill_setup WHERE skill_id = ? LIMIT 1",
    );
    stmt.bind([skillId]);
    const hasRow = stmt.step();
    const source = hasRow ? String(stmt.get()[0] ?? "local") : "local";
    stmt.free();
    return source;
  } catch {
    return "local";
  }
}

function createSkill(msg: Record<string, unknown>): void {
  const rawName = String(msg.name ?? "").trim();
  const slug = slugifySkill(rawName);
  if (!slug) return;
  // task-* prefix is required for the atrium skill-registry to load the
  // skill. Without it the skill would be invisible to council.matchSkills.
  const id = slug.startsWith("task-") ? slug : `task-${slug}`;
  const description =
    String(msg.description ?? "").trim() || `Parix skill for ${rawName}.`;
  const requirements = Array.isArray(msg.requirements)
    ? msg.requirements
        .map(String)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  const secrets =
    msg.secrets && typeof msg.secrets === "object"
      ? (msg.secrets as Record<string, unknown>)
      : {};
  const triggers = Array.isArray(msg.triggers)
    ? (msg.triggers as unknown[]).filter(
        (t): t is Record<string, unknown> =>
          !!t && typeof t === "object" && typeof (t as Record<string, unknown>).eventType === "string",
      )
    : [];
  const declaredPermissions = Array.isArray(msg.permissions)
    ? (msg.permissions as unknown[])
        .filter((p): p is string => typeof p === "string")
    : [];
  const runtime = ((): "py" | "node" | "sh" => {
    const r = String(msg.runtime ?? "").toLowerCase();
    return r === "node" || r === "sh" ? r : "py";
  })();

  // Write to skills/task-<id>/ (the atrium-registry-loaded path) and
  // ALSO keep the Anthropic-style mirror at .agents/skills/<id>/ for the
  // Aegis list. Mirror is symlink-style: same SKILL.md, no scripts.
  const skillDir = join(TASK_SKILLS_DIR, id);
  mkdirSync(join(skillDir, "scripts"), { recursive: true });
  mkdirSync(join(skillDir, "references"), { recursive: true });
  mkdirSync(join(skillDir, "templates"), { recursive: true });

  const entryFile =
    runtime === "node" ? "run.cjs" : runtime === "sh" ? "run.sh" : "run.py";
  const entryPath = join(skillDir, "scripts", entryFile);
  const stub =
    runtime === "node"
      ? `let buf = "";\nprocess.stdin.on("data", (c) => (buf += c));\nprocess.stdin.on("end", () => {\n  let inputs = {};\n  try { inputs = JSON.parse(buf || "{}"); } catch {}\n  process.stdout.write(JSON.stringify({ ok: true, skill: "${id}", inputs }));\n});\n`
      : runtime === "sh"
        ? `#!/usr/bin/env bash\nINPUT=$(cat)\necho '{"ok": true, "skill": "${id}", "input_bytes": '"\${#INPUT}"'}'\n`
        : `#!/usr/bin/env python3\nimport json, sys\nraw = sys.stdin.read().strip()\ntry:\n    inputs = json.loads(raw) if raw else {}\nexcept json.JSONDecodeError:\n    inputs = {}\nprint(json.dumps({"ok": True, "skill": "${id}", "inputs": inputs}))\n`;
  writeFileSync(entryPath, stub, "utf-8");

  const manifest = {
    id,
    version: "1.0",
    enabled: true,
    description,
    triggers,
    entry: `scripts/${entryFile}`,
    runtime,
    inputs: [],
    outputs: [],
    reversibility: 1.0,
    permissions: declaredPermissions,
    timeoutMs: 30000,
    settings: {},
  };
  writeFileSync(
    join(skillDir, "config.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf-8",
  );

  writeFileSync(
    join(skillDir, "SKILL.md"),
    `---\nname: ${id}\ndescription: ${description.replace(/\n/g, " ")}\n---\n\n# ${rawName || id}\n\n${description}\n\n## Setup Requirements\n\n${requirements.length ? requirements.map((req) => `- ${req}`).join("\n") : "- None"}\n\n## Triggers\n\n${triggers.length ? triggers.map((t) => `- \`${(t as Record<string, unknown>).eventType}\``).join("\n") : "- None (skill is library-only — invoked explicitly, not on sensor events)"}\n\n## Permissions\n\n${declaredPermissions.length ? declaredPermissions.map((p) => `- \`${p}\``).join("\n") : "- None"}\n\n## Usage\n\nThe stub at \`scripts/${entryFile}\` echoes its stdin JSON back. Replace it with real logic.\n`,
    "utf-8",
  );
  writeFileSync(
    join(skillDir, "templates", "setup.json"),
    JSON.stringify(
      { requirements, configured: Object.keys(secrets).length > 0 },
      null,
      2,
    ) + "\n",
    "utf-8",
  );

  // Mirror a thin SKILL.md into .agents/skills/<id>/ so the existing Aegis
  // "Installed Skills" list keeps surfacing user-created skills. The mirror
  // is metadata-only; the runnable artifact lives under skills/.
  try {
    const mirrorDir = join(AGENT_SKILLS_DIR, id);
    mkdirSync(mirrorDir, { recursive: true });
    writeFileSync(
      join(mirrorDir, "SKILL.md"),
      `---\nname: ${id}\ndescription: ${description.replace(/\n/g, " ")}\nmirror_of: skills/${id}\n---\n\n# ${rawName || id}\n\nUser-created via Aegis. Runnable manifest lives at \`skills/${id}/config.json\`.\n`,
      "utf-8",
    );
  } catch {
    // mirror is best-effort — failing here must not block skill creation
  }

  getDb().run(
    `INSERT INTO skill_setup (skill_id, source, requirements, configured, updated_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(skill_id) DO UPDATE SET
       source = excluded.source,
       requirements = excluded.requirements,
       configured = excluded.configured,
       updated_at = CURRENT_TIMESTAMP`,
    [
      id,
      String(msg.source ?? "aegis-create"),
      JSON.stringify({
        requirements,
        secrets: Object.keys(secrets),
        permissions: declaredPermissions,
      }),
      requirements.length || declaredPermissions.length ? 1 : 1,
    ],
  );

  // Register the declared permissions in the runtime grant map so the
  // skill-runner's permission gate doesn't reject a user-authored skill
  // for asking for filesystem:read etc. User-created skills are trusted
  // because the user created them in their own Aegis instance.
  registerUserCreatedSkillPermissions(id, declaredPermissions);

  // Hot-reload the skill registry so the council can immediately route
  // events to the new skill without restarting atrium.
  try {
    loadSkills(TASK_SKILLS_DIR);
  } catch (err) {
    console.warn(
      `[AEGIS] Created skill ${id} but failed to reload registry: ${(err as Error).message}`,
    );
  }
}

function getWorkspaceFiles(): Array<{ path: string; exists: boolean }> {
  return [
    "IDENTITY.md",
    "SOUL.md",
    "USER.md",
    "AGENTS.md",
    "TOOLS.md",
    "HEARTBEAT.md",
    "MEMORY.md",
    `memory/${new Date().toISOString().slice(0, 10)}.md`,
    "checklists/critical-action.md",
  ].map((relativePath) => ({
    path: relativePath,
    exists: existsSync(resolve(PROJECT_ROOT, relativePath)),
  }));
}

function initWorkspaceFiles(): { written: string[]; skipped: string[] } {
  const profile = getProfile();
  const today = new Date().toISOString().slice(0, 10);
  const wakeWord = profile?.channels.settings.aegis?.wakeWord ?? "aegis";
  const mode = profile?.mode ?? "personal";
  const files: Record<string, string> = {
    "IDENTITY.md": `# Parix Identity\n\n- Agent name: Parix\n- Routing ID: parix.atrium.local\n- Active role: ${mode} operator\n- Mode: ${mode}\n- Avatar: Parix magenta Atrium mark\n- Default channel: Aegis Voice\n- Aegis wake word: ${wakeWord}\n`,
    "SOUL.md": `# Parix Soul\n\nParix is a local-first proactive operator: warm, direct, useful, and careful with user agency.\n\n## Voice\n\n- Helpful without being bland.\n- Clear before risky actions.\n- Proactive when the task is safe and obvious.\n`,
    "USER.md": `# User Profile\n\nIdentity is collected by Hatchery during setup. Add preferences, work parameters, and daily schedules here.\n`,
    "AGENTS.md": `# Parix Agent Operations\n\n1. Read the request.\n2. Check relevant workspace context and memory.\n3. Respect configured permissions and channels.\n4. Prefer reversible actions.\n5. Log durable outcomes.\n`,
    "TOOLS.md": `# Parix Tools Registry\n\n- Atrium: Node.js brain\n- Hands: Python executor and sensors\n- Aegis: voice-first dashboard\n- Hatchery: onboarding and setup\n- Skills path: .agents/skills\n`,
    "HEARTBEAT.md": `# Parix Heartbeat\n\nRun safe background checks, enabled cron tasks, setup nudges, and memory distillation when idle.\n`,
    "MEMORY.md": `# Parix Memory\n\n## Standing Facts\n\n- Default voice channel: Aegis\n- Wake word: ${wakeWord}\n\n## Ongoing Projects\n\n- Parix workspace setup\n`,
    [`memory/${today}.md`]: `# Daily Memory - ${today}\n\n## Session Log\n\n- Workspace files initialized from Hatchery.\n`,
    "checklists/critical-action.md": `# Critical Action Checklist\n\n- Confirm scope.\n- Check reversibility.\n- Ask for confirmation when required.\n- Execute the smallest viable action.\n- Record the result.\n`,
  };
  const written: string[] = [];
  const skipped: string[] = [];
  for (const [relativePath, content] of Object.entries(files)) {
    const path = resolve(PROJECT_ROOT, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    if (existsSync(path)) {
      skipped.push(relativePath);
      continue;
    }
    writeFileSync(path, content, "utf-8");
    written.push(relativePath);
  }
  mkdirSync(AGENT_SKILLS_DIR, { recursive: true });
  return { written, skipped };
}

function slugifySkill(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function getChannelSnapshot(): Array<{
  id: string;
  enabled: boolean;
  config: Record<string, unknown>;
}> {
  const rows: Array<{
    id: string;
    enabled: boolean;
    config: Record<string, unknown>;
  }> = [];
  try {
    const stmt = getDb().prepare(
      "SELECT channel_id, enabled, config FROM channel_config ORDER BY channel_id",
    );
    while (stmt.step()) {
      const [id, enabled, config] = stmt.get();
      rows.push({
        id: String(id),
        enabled: Number(enabled) === 1,
        config: safeJsonParse(String(config ?? "{}")) ?? {},
      });
    }
    stmt.free();
  } catch {
    return [
      {
        id: "aegis",
        enabled: true,
        config: { kind: "voice", autoStart: "true", wakeWord: "aegis" },
      },
    ];
  }
  return rows;
}

function saveChannelSelection(msg: Record<string, unknown>): void {
  const selected = Array.isArray(msg.enabled)
    ? msg.enabled.map(String).filter(Boolean)
    : [];
  const wakeWord =
    String(msg.wakeWord ?? "aegis")
      .trim()
      .toLowerCase() || "aegis";
  saveRuntimeChannelConfig(selected, wakeWord);
}

function wireEngineEvents(): void {
  engine.on("state_change", (from: string, to: string) => {
    broadcast({ type: "STATE_CHANGE", from, to });
  });

  engine.on(
    "action_executed",
    (plan: Record<string, unknown>, success: boolean) => {
      broadcast({
        type: "ACTION_EXECUTED",
        plan: {
          id: plan.id,
          taskType: plan.taskType,
          reasoning: plan.reasoning,
        },
        success,
      });
    },
  );

  engine.on(
    "action_blocked",
    (plan: Record<string, unknown>, reason: string) => {
      broadcast({
        type: "ACTION_BLOCKED",
        plan: {
          id: plan.id,
          taskType: plan.taskType,
          reasoning: plan.reasoning,
        },
        reason,
      });
    },
  );

  engine.on("error", (err: Error) => {
    broadcast({ type: "ENGINE_ERROR", message: err.message });
  });

  // Forward sensor events from Synapse
  synapse.on("sensor_event", (event: Record<string, unknown>) => {
    broadcast({
      type: "SENSOR_EVENT",
      event_type: event.event_type,
      data: event.data,
      confidence: event.confidence,
      timestamp: event.timestamp,
    });
  });

  synapse.on("silent_intent", (event: Record<string, unknown>) => {
    broadcast({
      type: "SENSOR_EVENT",
      event_type: `silent:${event.intent_type}`,
      data: event.data,
      confidence: event.confidence,
      timestamp: event.timestamp,
    });
  });
}

function broadcastHealthSnapshot(): void {
  if (clients.size === 0) return;
  broadcast({ type: "HEALTH_SNAPSHOT", data: buildHealthSnapshot() });
}

function broadcast(msg: Record<string, unknown>): void {
  const payload = JSON.stringify(msg);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

function sendTo(ws: WebSocket, msg: Record<string, unknown>): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function safeJsonParse(str: string): Record<string, unknown> | null {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}
