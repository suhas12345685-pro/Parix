import { EventEmitter } from "events";
import { v4 as uuid } from "uuid";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import {
  logEvent,
  getRecentEvents,
  logTask,
  updateTaskState,
} from "../memory/db.js";
import { type SynapseClient } from "../synapse/client.js";
import { constitution, type ConstitutionVerdict } from "./constitution.js";
import { governor } from "./governor.js";
import { scoreReversibility } from "./reversibility.js";
import { audit } from "./audit.js";
import { lookupSkill, recordSkill } from "./skillcache.js";
import { enqueue as dlqEnqueue } from "./deadletter.js";
import { dispatch as notify, type NotificationPayload } from "./notify.js";
import { isPaused, pause } from "./pause.js";
import { explainAction, type ActionExplanation } from "./explainability.js";
import { TokenBudgetExceededError, type LLMRouter } from "../llm/router.js";
import { recordActivity, recall } from "./episodes.js";
import { recallBeforeTask, saveApproach } from "./recall-daemon.js";
import { addSignal, assess } from "./situations.js";
import { observeEvent, observeOutcome } from "./surprises.js";
import { getActiveSkills } from "../config/install-context.js";
import { getLastCognitiveSnapshot, runCognition } from "../cognition/index.js";
import { learnFromOutcome } from "../cognition/learning.js";
import {
  decompose,
  nextExecutable,
  advance,
  getProgress,
  type GoalTree,
} from "../cognition/planner/index.js";
import { savePlanTree } from "../cognition/planner/store.js";
import {
  checkCoherence,
  getActiveNarratives,
  recordAttempt,
  startNarrative,
} from "../cognition/horizon.js";
import { saveNarrative } from "../cognition/horizon-store.js";
import { matchSkills } from "./skill-registry.js";
import { runSkillsInParallel } from "./skill-fanout.js";
import { isAutonomousMode } from "../config/profile.js";
import {
  createDefaultNeuroSymbolicBridge,
  type ActionIR,
  type NeuroSymbolicDecision,
} from "../neurosymbolic/index.js";

export type AtriumState =
  | "IDLE"
  | "OBSERVING"
  | "THINKING"
  | "ACTING"
  | "WAITING"
  | "ERROR";

const VALID_TRANSITIONS: Record<AtriumState, AtriumState[]> = {
  IDLE: ["OBSERVING", "ERROR"],
  OBSERVING: ["THINKING", "IDLE", "ERROR"],
  THINKING: ["ACTING", "WAITING", "IDLE", "ERROR"],
  ACTING: ["WAITING", "IDLE", "ERROR"],
  WAITING: ["IDLE", "OBSERVING", "ERROR"],
  ERROR: ["IDLE"],
};

interface SensorEvent {
  event_type: string;
  data: Record<string, unknown>;
  confidence: number;
  timestamp: number;
}

interface SilentIntentEvent {
  intent_type: string;
  data: Record<string, unknown>;
  confidence: number;
  timestamp: number;
}

interface ActionPlan {
  id: string;
  taskType: string;
  payload: Record<string, unknown>;
  reversibilityScore: number;
  constitutionVerdict: ConstitutionVerdict;
  reasoning: string;
}

export interface UserRequestOutcome {
  /** True when Parix actually executed an action for this request. */
  acted: boolean;
  success?: boolean;
  output?: string;
  error?: string;
  reasoning?: string;
  taskType?: string;
  /** Set when an action was planned but stopped (paused/constitution/rate limit). */
  blocked?: string;
}

export interface AtriumEvents {
  state_change: (from: AtriumState, to: AtriumState) => void;
  action_blocked: (plan: ActionPlan, reason: string) => void;
  action_executed: (plan: ActionPlan, success: boolean) => void;
  error: (err: Error) => void;
}

const CONFIDENCE_THRESHOLD = 0.75;
const THINKING_TIMEOUT_MS = 10_000;
const ERROR_COOLDOWN_MS = 5_000;
const MAX_SKILL_CONTEXT_CHARS = 12_000;

export class AtriumEngine extends EventEmitter {
  private state: AtriumState = "IDLE";
  private synapse: SynapseClient;
  private llmRouter: LLMRouter | null = null;
  private eventQueue: SensorEvent[] = [];
  private intentQueue: SilentIntentEvent[] = [];
  private processing = false;
  private errorCooldownTimer: ReturnType<typeof setTimeout> | null = null;
  private thinkingTimer: ReturnType<typeof setTimeout> | null = null;
  private neuroSymbolic = createDefaultNeuroSymbolicBridge();

  constructor(synapse: SynapseClient) {
    super();
    this.synapse = synapse;
  }

  /**
   * Attach an LLM router for v0.2 intelligent planning.
   * When set, unknown triggers go through LLM instead of returning null.
   */
  setLLMRouter(router: LLMRouter): void {
    this.llmRouter = router;
    console.log("[ATRIUM] LLM router attached — intelligent planning enabled");
  }

  getLLMRouter(): LLMRouter | null {
    return this.llmRouter;
  }

  getState(): AtriumState {
    return this.state;
  }

  setState(newState: AtriumState): void {
    if (newState === this.state) return;
    const valid: AtriumState[] = [
      "IDLE",
      "OBSERVING",
      "THINKING",
      "ACTING",
      "WAITING",
      "ERROR",
    ];
    this.state = valid.includes(newState) ? newState : "IDLE";
  }

  private transition(to: AtriumState): boolean {
    const allowed = VALID_TRANSITIONS[this.state];
    if (!allowed.includes(to)) {
      console.warn(`[ATRIUM] Invalid transition: ${this.state} → ${to}`);
      return false;
    }
    const from = this.state;
    this.state = to;
    this.synapse.updateWorldState(null, this.state);
    this.emit("state_change", from, to);
    console.log(`[ATRIUM] ${from} → ${to}`);
    return true;
  }

  ingestSensorEvent(event: SensorEvent): void {
    if (event.confidence < CONFIDENCE_THRESHOLD) {
      console.log(
        `[ATRIUM] Dropping low-confidence event: ${event.event_type} (${event.confidence})`,
      );
      return;
    }

    logEvent(
      uuid(),
      event.event_type,
      JSON.stringify(event.data),
      event.confidence,
    );

    // v0.2: Feed into context fusion + surprise tracking
    addSignal(event.event_type, event.data, event.confidence);
    observeEvent(event.event_type);
    const cognition = runCognition({
      type: event.event_type,
      data: event.data,
      confidence: event.confidence,
      timestamp: event.timestamp,
    });
    if (!cognition) return;

    this.eventQueue.push(event);
    this.processQueue();
  }

  ingestSilentIntent(event: SilentIntentEvent): void {
    if (event.confidence < CONFIDENCE_THRESHOLD) return;

    logEvent(
      uuid(),
      `silent:${event.intent_type}`,
      JSON.stringify(event.data),
      event.confidence,
    );
    const cognition = runCognition({
      type: `silent:${event.intent_type}`,
      data: event.data,
      confidence: event.confidence,
      timestamp: event.timestamp,
    });
    if (!cognition) return;

    this.intentQueue.push(event);
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    if (this.state === "ERROR") return;
    if (isPaused()) {
      console.log(
        `[ATRIUM] Paused — ${this.eventQueue.length + this.intentQueue.length} event(s) queued`,
      );
      return;
    }
    if (this.eventQueue.length === 0 && this.intentQueue.length === 0) return;

    this.processing = true;

    try {
      // IDLE → OBSERVING: we have events to look at
      if (this.state === "IDLE") {
        this.transition("OBSERVING");
      }

      if (this.state !== "OBSERVING") {
        this.processing = false;
        return;
      }

      const event = this.eventQueue.shift();
      const intent = this.intentQueue.shift();
      const context = await this.gatherContext();

      // v0.2: Check for multi-signal situations
      const situation = assess();
      if (situation) {
        console.log(
          `[ATRIUM] Situation detected: ${situation.inferred} (${situation.userState})`,
        );
        (context as Record<string, unknown>).situation = situation;
      }

      // v0.2: Record episode activity
      const trigger = event?.event_type ?? intent?.intent_type ?? "unknown";
      recordActivity(trigger, null, null, Object.keys(event?.data ?? {}));

      // OBSERVING → THINKING: decide what to do
      this.transition("THINKING");

      this.thinkingTimer = setTimeout(() => {
        if (this.state === "THINKING") {
          console.error("[ATRIUM] Thinking timeout — forcing ERROR");
          this.enterError(new Error("LLM timeout exceeded 10s"));
        }
      }, THINKING_TIMEOUT_MS);

      let plan = await this.deliberate(event, intent, context);

      if (this.thinkingTimer) {
        clearTimeout(this.thinkingTimer);
        this.thinkingTimer = null;
      }

      if (!plan) {
        this.transition("IDLE");
        this.processing = false;
        this.processQueue();
        return;
      }

      let activePlanTree: GoalTree | null = null;
      const cogSnapshot = getLastCognitiveSnapshot();
      if (cogSnapshot && cogSnapshot.decision.mode !== "reflex") {
        activePlanTree = decompose(
          cogSnapshot.decision.desire,
          cogSnapshot.decision.hypotheses,
          cogSnapshot.worldFacts,
        );
        savePlanTree(activePlanTree);

        const executable = nextExecutable(activePlanTree);
        if (executable.length > 0) {
          const node = executable[0];
          plan = {
            id: node.id,
            taskType: node.taskType,
            payload: node.payload,
            reversibilityScore: 0,
            constitutionVerdict: { allowed: true, reason: "" },
            reasoning: `Plan step: ${node.goal}`,
          };
        }

        plan.reversibilityScore = scoreReversibility(
          plan.taskType,
          plan.payload,
        );
        plan.constitutionVerdict = constitution.check(
          plan.taskType,
          plan.payload,
          {
            reversibilityScore: plan.reversibilityScore,
            confidence: event?.confidence ?? intent?.confidence ?? 0,
            handsStatus: this.synapse.getStatus(),
          },
        );
      }

      // Skill manifest fast path: if registered skills match the trigger
      // event, rewrite the plan to dispatch them via the local runner
      // instead of synapse. Constitution + reversibility still apply to
      // the rewritten plan — applied against the lowest-reversibility
      // skill so the most destructive call can block the whole fan-out.
      // When multiple skills match, they run in parallel under the per-
      // task cap (see skill-fanout.ts).
      if (event) {
        const matches = matchSkills({
          type: event.event_type,
          data: event.data,
          confidence: event.confidence,
        });
        if (matches.length > 0) {
          const sorted = matches
            .slice()
            .sort(
              (a, b) =>
                (b.manifest.reversibility ?? 0) -
                (a.manifest.reversibility ?? 0),
            );
          const skillCalls = sorted.map((m) => ({
            skillId: m.manifest.id,
            inputs: { ...(event.data ?? {}) },
          }));
          const minReversibility = sorted.reduce(
            (acc, m) => Math.min(acc, m.manifest.reversibility ?? 0),
            1,
          );
          plan = {
            id: plan.id,
            taskType: "skill",
            payload: {
              // Backward-compat: legacy single-skill path keeps these.
              skillId: sorted[0].manifest.id,
              inputs: { ...(event.data ?? {}) },
              _origTaskType: plan.taskType,
              // New: full fan-out spec. executeSkillPlan reads this
              // when present and dispatches all skills in parallel.
              skillCalls,
            },
            reversibilityScore: minReversibility,
            constitutionVerdict: plan.constitutionVerdict,
            reasoning:
              skillCalls.length === 1
                ? `Skill match: ${skillCalls[0].skillId} (rev=${minReversibility.toFixed(2)})`
                : `Skill fan-out: ${skillCalls.map((s) => s.skillId).join(", ")} (min rev=${minReversibility.toFixed(2)})`,
          };
          plan.constitutionVerdict = constitution.check(
            plan.taskType,
            plan.payload,
            {
              reversibilityScore: plan.reversibilityScore,
              confidence: event.confidence,
              handsStatus: this.synapse.getStatus(),
            },
          );
          console.log(
            `[ATRIUM] Skill dispatch: ${skillCalls.length === 1 ? sorted[0].manifest.id : `${skillCalls.length} skills in parallel`} (${matches.length} match${matches.length === 1 ? "" : "es"})`,
          );
        }
      }

      // Constitution preflight
      if (!plan.constitutionVerdict.allowed) {
        console.log(
          `[ATRIUM] Constitution blocked: ${plan.constitutionVerdict.reason}`,
        );
        this.emit("action_blocked", plan, plan.constitutionVerdict.reason);
        this.transition("IDLE");
        this.processing = false;
        this.processQueue();
        return;
      }

      // Governor check
      if (!governor.canSpend(plan.taskType)) {
        console.log("[ATRIUM] Governor rate limit — deferring");
        this.emit("action_blocked", plan, "rate_limit");
        this.transition("WAITING");
        setTimeout(() => {
          if (this.state === "WAITING") {
            this.transition("IDLE");
            this.processQueue();
          }
        }, 5_000);
        this.processing = false;
        return;
      }

      // THINKING → ACTING: execute the plan
      this.transition("ACTING");

      const coherence = checkCoherence(
        {
          id: plan.id,
          taskType: plan.taskType,
          payload: plan.payload,
          reason: plan.reasoning,
          reversibility: plan.reversibilityScore,
        },
        getActiveNarratives(),
      );

      if (!coherence.isCoherent && plan.reversibilityScore < 0.7) {
        console.log(
          `[ATRIUM] Coherence conflict: ${coherence.conflicts.join("; ")}`,
        );
      }

      if (coherence.suggestions.length > 0) {
        console.log(`[ATRIUM] Horizon suggestion: ${coherence.suggestions[0]}`);
      }

      const result = await this.execute(plan);

      if (activePlanTree) {
        activePlanTree = advance(
          activePlanTree,
          plan.id,
          result.success,
          result.output,
          result.error,
        );
        savePlanTree(activePlanTree);
        console.log(
          `[ATRIUM] Plan progress: ${getProgress(activePlanTree).percent}%`,
        );
      }

      this.recordExecutionOutcome(plan, result);

      // ACTING → WAITING or IDLE
      if (result.success) {
        this.transition("IDLE");
      } else {
        this.transition("WAITING");
        setTimeout(() => {
          if (this.state === "WAITING") {
            this.transition("IDLE");
            this.processQueue();
          }
        }, 3_000);
      }
    } catch (err) {
      if (err instanceof TokenBudgetExceededError) {
        await this.enterTokenBudgetPause(err);
        return;
      }
      this.enterError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      this.processing = false;
      if (
        this.state === "IDLE" &&
        (this.eventQueue.length > 0 || this.intentQueue.length > 0)
      ) {
        this.processQueue();
      }
    }
  }

  private async gatherContext(): Promise<Record<string, unknown>> {
    const recentEvents = getRecentEvents(20);

    const eventTypes = recentEvents
      .map((e: Record<string, unknown>) => String(e.event_type ?? ""))
      .filter(Boolean);
    const pastEpisodes = recall(eventTypes.slice(0, 5));

    const primaryTrigger = eventTypes[0] ?? "unknown";
    const entities = recentEvents
      .slice(0, 3)
      .flatMap((e: Record<string, unknown>) =>
        Object.keys((e.data as object) ?? {}),
      );
    const preTaskMemory = recallBeforeTask(
      primaryTrigger,
      primaryTrigger,
      entities,
    );

    return {
      recentEvents,
      handsStatus: this.synapse.getStatus(),
      pendingTasks: this.synapse.getPendingCount(),
      pastEpisodes: pastEpisodes.map((ep) => ({
        summary: ep.summary,
        outcome: ep.outcome,
      })),
      preTaskMemory: {
        constraints: preTaskMemory.knownConstraints.map((c) => c.constraint),
        recommendations: preTaskMemory.recommendations,
        priorOutcomes: preTaskMemory.priorAttempts.map((a) => ({
          summary: a.summary,
          outcome: a.outcome,
          relevance: a.relevance,
        })),
      },
      cognition: getLastCognitiveSnapshot(),
      activeSkills: getActiveSkills(),
      skillContext: this.loadActiveSkillContext(),
      timestamp: Date.now(),
    };
  }

  private loadActiveSkillContext(): string {
    const home = process.env.PARIX_HOME || resolve(process.cwd(), "..");
    const chunks: string[] = [];

    for (const skillPath of getActiveSkills()) {
      const fullPath = resolve(home, skillPath);
      if (!existsSync(fullPath)) continue;

      const text = readFileSync(fullPath, "utf-8").slice(0, 4_000);
      chunks.push(`--- ${skillPath} ---\n${text}`);

      if (chunks.join("\n\n").length >= MAX_SKILL_CONTEXT_CHARS) break;
    }

    return chunks.join("\n\n").slice(0, MAX_SKILL_CONTEXT_CHARS);
  }

  private async deliberate(
    event: SensorEvent | undefined,
    intent: SilentIntentEvent | undefined,
    context: Record<string, unknown>,
  ): Promise<ActionPlan | null> {
    const trigger = event?.event_type ?? intent?.intent_type ?? "unknown";
    const triggerData = event?.data ?? intent?.data ?? {};

    // Check skill cache first — skip LLM if we've seen this pattern before
    const cached = lookupSkill(trigger, triggerData);
    if (cached) {
      const plan: ActionPlan = {
        id: uuid(),
        taskType: cached.taskType,
        payload: cached.payload,
        reversibilityScore: scoreReversibility(cached.taskType, cached.payload),
        constitutionVerdict: { allowed: true, reason: "" },
        reasoning: `Cached skill: ${trigger} → ${cached.taskType}`,
      };

      plan.constitutionVerdict = constitution.check(
        plan.taskType,
        plan.payload,
        {
          reversibilityScore: plan.reversibilityScore,
          confidence: event?.confidence ?? intent?.confidence ?? 0,
          handsStatus: this.synapse.getStatus(),
        },
      );

      return plan;
    }

    const neuroSymbolicPlan = await this.planFromNeuroSymbolic(
      trigger,
      triggerData,
      event,
      intent,
      context,
    );

    const plan = (await this.buildPlan(trigger, triggerData, context)) ??
      neuroSymbolicPlan;
    if (!plan) return null;

    plan.reversibilityScore = scoreReversibility(plan.taskType, plan.payload);

    plan.constitutionVerdict = constitution.check(plan.taskType, plan.payload, {
      reversibilityScore: plan.reversibilityScore,
      confidence: event?.confidence ?? intent?.confidence ?? 0,
      handsStatus: this.synapse.getStatus(),
    });

    return plan;
  }

  private async planFromNeuroSymbolic(
    trigger: string,
    data: Record<string, unknown>,
    event: SensorEvent | undefined,
    intent: SilentIntentEvent | undefined,
    context: Record<string, unknown>,
  ): Promise<ActionPlan | null> {
    const confidence = event?.confidence ?? intent?.confidence ?? 0;
    const timestamp = event?.timestamp ?? intent?.timestamp ?? Date.now() / 1000;

    const decision = await this.neuroSymbolic.decide(
      {
        type: trigger,
        data,
        confidence,
        timestamp,
      },
      {
        handsStatus: this.synapse.getStatus(),
        confidence,
        context,
      },
    );

    context.neuroSymbolic = decision.trace;

    if (decision.trace.candidates.length > 0) {
      console.log(
        `[ATRIUM] Neuro-symbolic ${decision.verdict}: ${decision.reason} (${decision.trace.latencyMs}ms)`,
      );
    }

    if (!decision.action || decision.action.kind === "none") {
      return null;
    }

    return this.actionIrToPlan(decision.action, decision);
  }

  private actionIrToPlan(
    action: ActionIR,
    decision: NeuroSymbolicDecision,
  ): ActionPlan {
    const taskType = action.kind === "notify" ? "notification" : action.kind;
    return {
      id: action.id,
      taskType,
      payload: action.payload,
      reversibilityScore: action.reversibility,
      constitutionVerdict: { allowed: true, reason: "" },
      reasoning: `Neuro-symbolic ${decision.verdict}: ${action.explanation}`,
    };
  }

  private async buildPlan(
    trigger: string,
    data: Record<string, unknown>,
    _context: Record<string, unknown>,
  ): Promise<ActionPlan | null> {
    // Local fallback path when no LLM route is available.
    switch (trigger) {
      case "terminal_error":
        return {
          id: uuid(),
          taskType: "cli",
          payload: this.buildFixPayload(data),
          reversibilityScore: 0,
          constitutionVerdict: { allowed: true, reason: "" },
          reasoning: `Fix terminal error: ${data.error ?? "unknown"}`,
        };

      case "disk_space_low":
        return {
          id: uuid(),
          taskType: "cli",
          payload: { command: this.buildDiskCleanupCommand() },
          reversibilityScore: 0,
          constitutionVerdict: { allowed: true, reason: "" },
          reasoning: "Disk space cleanup",
        };

      case "silent:idle_shutdown":
        return {
          id: uuid(),
          taskType: "cli",
          payload: { command: this.buildShutdownWarningCommand() },
          reversibilityScore: 1.0,
          constitutionVerdict: { allowed: true, reason: "" },
          reasoning: "Idle + low battery — warn user about potential shutdown",
        };

      case "silent:tab_overload":
        return {
          id: uuid(),
          taskType: "notification",
          payload: {
            title: "Tab Overload",
            body: `You have ${data.tab_count ?? "many"} tabs open. Consider closing unused ones.`,
            urgency: "low",
          },
          reversibilityScore: 1.0,
          constitutionVerdict: { allowed: true, reason: "" },
          reasoning: "Too many browser tabs — notify user",
        };

      case "service_down":
        return {
          id: uuid(),
          taskType: "cli",
          payload: {
            command:
              `systemctl --user restart ${data.service_name ?? ""}`.trim(),
          },
          reversibilityScore: 0.7,
          constitutionVerdict: { allowed: true, reason: "" },
          reasoning: `Restart downed service: ${data.service_name ?? "unknown"}`,
        };

      case "high_cpu":
      case "cpu_high":
        return {
          id: uuid(),
          taskType: "notification",
          payload: {
            title: "High CPU Usage",
            body: `CPU usage at ${data.percent ?? data.cpu_percent ?? "?"}%.`,
            urgency: "medium",
          },
          reversibilityScore: 1.0,
          constitutionVerdict: { allowed: true, reason: "" },
          reasoning: "High CPU alert",
        };

      case "disk_low":
        return {
          id: uuid(),
          taskType: "cli",
          payload: { command: this.buildDiskCleanupCommand() },
          reversibilityScore: 0.5,
          constitutionVerdict: { allowed: true, reason: "" },
          reasoning: `Low disk space detected`,
        };

      case "memory_high":
        return {
          id: uuid(),
          taskType: "notification",
          payload: {
            title: "High Memory Usage",
            body: `RAM usage at ${data.used_pct ?? "?"}% — ${data.available_gb ?? "?"} GB available.`,
            urgency: "medium",
          },
          reversibilityScore: 1.0,
          constitutionVerdict: { allowed: true, reason: "" },
          reasoning: "Memory pressure alert",
        };

      case "swap_high":
        return {
          id: uuid(),
          taskType: "notification",
          payload: {
            title: "High Swap Usage",
            body: `Swap usage at ${data.swap_pct ?? "?"}%. Consider closing applications.`,
            urgency: "low",
          },
          reversibilityScore: 1.0,
          constitutionVerdict: { allowed: true, reason: "" },
          reasoning: "Swap pressure alert",
        };

      case "battery_low":
        return {
          id: uuid(),
          taskType: "notification",
          payload: {
            title: "Battery Low",
            body: `Battery at ${data.percent ?? "?"}%. Plug in soon.`,
            urgency: "high",
          },
          reversibilityScore: 1.0,
          constitutionVerdict: { allowed: true, reason: "" },
          reasoning: "Battery low — notify user",
        };

      case "clipboard_sensitive_data":
        return {
          id: uuid(),
          taskType: "notification",
          payload: {
            title: "Sensitive Data on Clipboard",
            body: `Your clipboard contains what looks like ${(data.matches as string[])?.join(", ") ?? "secrets"}. Be careful pasting.`,
            urgency: "high",
          },
          reversibilityScore: 1.0,
          constitutionVerdict: { allowed: true, reason: "" },
          reasoning: "Sensitive clipboard data detected",
        };

      case "silent:long_uptime":
        return {
          id: uuid(),
          taskType: "notification",
          payload: {
            title: "Long Uptime",
            body: `System has been running for ${data.uptime_hours ?? "?"} hours. Consider a reboot.`,
            urgency: "low",
          },
          reversibilityScore: 1.0,
          constitutionVerdict: { allowed: true, reason: "" },
          reasoning: "Long uptime — suggest reboot",
        };

      // ── Wi-Fi events ──────────────────────────────────────────

      case "wifi_disconnected":
        return {
          id: uuid(),
          taskType: "notification",
          payload: {
            title: "Wi-Fi Disconnected",
            body: `Lost connection${data.last_ssid ? ` to "${data.last_ssid}"` : ""}. Check your network.`,
            urgency: "high",
          },
          reversibilityScore: 1.0,
          constitutionVerdict: { allowed: true, reason: "" },
          reasoning: "Wi-Fi disconnected — alert user",
        };

      case "wifi_reconnected":
        return {
          id: uuid(),
          taskType: "notification",
          payload: {
            title: "Wi-Fi Reconnected",
            body: `Connected to "${data.ssid ?? "network"}".`,
            urgency: "low",
          },
          reversibilityScore: 1.0,
          constitutionVerdict: { allowed: true, reason: "" },
          reasoning: "Wi-Fi reconnected — inform user",
        };

      case "wifi_weak_signal":
        return {
          id: uuid(),
          taskType: "notification",
          payload: {
            title: "Weak Wi-Fi Signal",
            body: `Signal at ${data.signal_dbm ?? "?"} dBm on "${data.ssid ?? "network"}". Move closer to the router.`,
            urgency: "low",
          },
          reversibilityScore: 1.0,
          constitutionVerdict: { allowed: true, reason: "" },
          reasoning: "Weak Wi-Fi — notify user",
        };

      // ── USB events ────────────────────────────────────────────

      case "usb_device_connected":
      case "usb_storage_connected":
        return {
          id: uuid(),
          taskType: "notification",
          payload: {
            title:
              data.type === "storage"
                ? "Storage Device Connected"
                : "USB Device Connected",
            body: `"${data.name ?? "Unknown device"}" plugged in.`,
            urgency: "low",
          },
          reversibilityScore: 1.0,
          constitutionVerdict: { allowed: true, reason: "" },
          reasoning: "USB device connected — notify user",
        };

      case "usb_device_disconnected":
        return {
          id: uuid(),
          taskType: "notification",
          payload: {
            title: "USB Device Removed",
            body: "A USB device was disconnected.",
            urgency: "low",
          },
          reversibilityScore: 1.0,
          constitutionVerdict: { allowed: true, reason: "" },
          reasoning: "USB device removed — notify user",
        };

      // ── App crash events ──────────────────────────────────────

      case "app_crash":
        return {
          id: uuid(),
          taskType: "notification",
          payload: {
            title: "Application Crashed",
            body: `"${data.app ?? "Unknown"}" crashed.${data.oom ? " (Out of memory)" : ""}`,
            urgency: "high",
          },
          reversibilityScore: 1.0,
          constitutionVerdict: { allowed: true, reason: "" },
          reasoning: `App crash detected: ${data.app ?? "unknown"}`,
        };

      case "app_hang":
        return {
          id: uuid(),
          taskType: "notification",
          payload: {
            title: "Application Not Responding",
            body: `"${data.app ?? "Unknown"}" stopped responding.`,
            urgency: "medium",
          },
          reversibilityScore: 1.0,
          constitutionVerdict: { allowed: true, reason: "" },
          reasoning: `App hang detected: ${data.app ?? "unknown"}`,
        };

      default:
        {
          const cognitivePlan = this.planFromCognition(_context);
          if (cognitivePlan) return cognitivePlan;
        }
        // v0.2: If LLM router is available, ask it to plan
        if (this.llmRouter) {
          return await this.llmPlan(trigger, data, _context);
        }
        console.log(`[ATRIUM] No plan for trigger: ${trigger}`);
        return null;
    }
  }

  private async llmPlan(
    trigger: string,
    data: Record<string, unknown>,
    context: Record<string, unknown>,
  ): Promise<ActionPlan | null> {
    if (!this.llmRouter) return null;

    try {
      const prompt = [
        "You are Parix, an autonomous OS agent. A sensor event occurred and you need to decide what action to take.",
        "",
        `Event type: ${trigger}`,
        `Event data: ${JSON.stringify(data)}`,
        `Context: ${JSON.stringify(context)}`,
        "",
        "Respond with a JSON object containing:",
        '  - taskType: "cli" | "operate" | "notification" | "none"',
        '  - payload: { command: "..." } for cli, { goal: "..." } for operate, or { title: "...", body: "...", urgency: "low"|"medium"|"high" } for notification',
        "  - reasoning: one sentence explaining why",
        "",
        'Use "operate" only when GUI interaction is required (clicking/typing in a visible app); goal describes the on-screen task.',
        'If no action is needed, set taskType to "none".',
        "Never run destructive commands (rm -rf, format, shutdown, sudo).",
        "Respond ONLY with valid JSON, no markdown.",
      ].join("\n");

      const response = await this.llmRouter.complete(
        {
          prompt,
          systemPrompt:
            "You are a cautious system assistant. Only suggest safe, reversible actions.",
          temperature: 0.2,
          maxTokens: 300,
        },
        "reasoning",
        uuid(),
      );

      const parsed = JSON.parse(response.text.trim());

      if (!parsed.taskType || parsed.taskType === "none") {
        console.log(`[ATRIUM] LLM decided no action for: ${trigger}`);
        return null;
      }

      return {
        id: uuid(),
        taskType: parsed.taskType,
        payload: parsed.payload ?? {},
        reversibilityScore: 0,
        constitutionVerdict: { allowed: true, reason: "" },
        reasoning: `LLM: ${parsed.reasoning ?? trigger}`,
      };
    } catch (err) {
      if (err instanceof TokenBudgetExceededError) {
        throw err;
      }
      console.error(
        `[ATRIUM] LLM planning failed: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  private recordExecutionOutcome(
    plan: ActionPlan,
    result: { success: boolean; output?: string; error?: string },
  ): void {
    governor.recordSpend(plan.taskType);
    this.emit("action_executed", plan, result.success);

    const narrative = startNarrative(plan.reasoning, plan.taskType);
    recordAttempt(narrative.id, {
      approach: `${plan.taskType}: ${plan.reasoning}`,
      outcome: result.success ? "success" : "failure",
      timestamp: Date.now(),
      lessonLearned: result.error ?? undefined,
    });
    saveNarrative(narrative);

    // v0.2: Track episode + surprises + learnings
    recordActivity(plan.taskType, plan.id, plan.reasoning);
    observeOutcome(
      plan.taskType,
      "success",
      result.success ? "success" : "failure",
    );
    learnFromOutcome(plan.taskType, result.success, plan.reasoning);
    saveApproach(
      plan.taskType,
      plan.reasoning,
      result.success ? "success" : "failure",
      `${plan.taskType}: ${plan.reasoning} → ${result.success ? "ok" : (result.error ?? "failed")}`,
      Object.keys(plan.payload).slice(0, 5),
    );
  }

  /**
   * Execute an explicit, free-text user request (e.g. from the Aegis chat
   * box). Unlike sensor events, this is a direct instruction to *do* something,
   * so it goes straight through plan → constitution → execute and returns the
   * real outcome to the caller. When the request isn't actionable (it's a
   * question, or the planner declines), `acted` is false so the caller can
   * fall back to a conversational answer.
   */
  async runUserRequest(text: string): Promise<UserRequestOutcome> {
    const message = text.trim();
    if (!message) return { acted: false };

    if (isPaused()) {
      return {
        acted: false,
        blocked: "paused",
        reasoning: "Parix is paused — say 'resume parix' before I act.",
      };
    }

    const context = await this.gatherContext();
    const plan = await this.userRequestPlan(message, context);
    if (!plan) return { acted: false };

    plan.reversibilityScore = scoreReversibility(plan.taskType, plan.payload);
    plan.constitutionVerdict = constitution.check(plan.taskType, plan.payload, {
      reversibilityScore: plan.reversibilityScore,
      confidence: 1,
      handsStatus: this.synapse.getStatus(),
    });

    if (!plan.constitutionVerdict.allowed) {
      this.emit("action_blocked", plan, plan.constitutionVerdict.reason);
      return {
        acted: false,
        blocked: plan.constitutionVerdict.reason,
        reasoning: plan.reasoning,
      };
    }

    if (!governor.canSpend(plan.taskType)) {
      this.emit("action_blocked", plan, "rate_limit");
      return { acted: false, blocked: "rate_limit", reasoning: plan.reasoning };
    }

    const result = await this.execute(plan);
    this.recordExecutionOutcome(plan, result);

    return {
      acted: true,
      success: result.success,
      output: result.output,
      error: result.error,
      reasoning: plan.reasoning,
      taskType: plan.taskType,
    };
  }

  private async userRequestPlan(
    text: string,
    context: Record<string, unknown>,
  ): Promise<ActionPlan | null> {
    if (!this.llmRouter) return null;

    try {
      const prompt = [
        "You are Parix, an autonomous OS agent. The user has directly asked you to do something via their chat box. Decide what action carries it out.",
        "",
        `User request: ${text}`,
        `Context: ${JSON.stringify(context)}`,
        "",
        "Respond with a JSON object containing:",
        '  - taskType: "cli" | "operate" | "notification" | "none"',
        '  - payload: { command: "..." } for cli, { goal: "..." } for operate, or { title: "...", body: "...", urgency: "low"|"medium"|"high" } for notification',
        "  - reasoning: one sentence explaining what you are doing",
        "",
        'Use "cli" when the request is something you can carry out with a shell command on the user\'s machine.',
        'Use "operate" when the request requires interacting with on-screen GUI apps (clicking buttons, typing into fields, navigating an app the user can see). The goal should describe the on-screen task in plain language; a vision agent will see the screen and act.',
        'Use "notification" when the right response is to surface information to the user.',
        'Set taskType to "none" ONLY when the request is a pure question or chitchat with no action to take.',
        "Never run destructive commands (rm -rf, format, shutdown, sudo, disk wipes).",
        "Respond ONLY with valid JSON, no markdown.",
      ].join("\n");

      const response = await this.llmRouter.complete(
        {
          prompt,
          systemPrompt:
            "You are a capable but cautious system operator. Prefer safe, reversible actions and only decline when there is genuinely nothing to do.",
          temperature: 0.2,
          maxTokens: 400,
        },
        "reasoning",
        uuid(),
      );

      const parsed = JSON.parse(response.text.trim());
      if (!parsed.taskType || parsed.taskType === "none") return null;

      return {
        id: uuid(),
        taskType: parsed.taskType,
        payload: parsed.payload ?? {},
        reversibilityScore: 0,
        constitutionVerdict: { allowed: true, reason: "" },
        reasoning: `User request: ${parsed.reasoning ?? text}`,
      };
    } catch (err) {
      if (err instanceof TokenBudgetExceededError) throw err;
      console.error(
        `[ATRIUM] User-request planning failed: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  private planFromCognition(
    context: Record<string, unknown>,
  ): ActionPlan | null {
    const cognition = context.cognition as ReturnType<
      typeof getLastCognitiveSnapshot
    >;
    const decision = cognition?.decision;

    if (
      !decision?.shouldInterrupt ||
      decision.recommendedAction.taskType !== "notification"
    ) {
      return null;
    }

    return {
      id: uuid(),
      taskType: "notification",
      payload: decision.recommendedAction.payload,
      reversibilityScore: 1,
      constitutionVerdict: { allowed: true, reason: "" },
      reasoning: `Cognition: ${decision.desire.inferredGoal}`,
    };
  }

  private buildFixPayload(
    data: Record<string, unknown>,
  ): Record<string, unknown> {
    const error = String(data.error ?? "");

    if (error.includes("ENOSPC"))
      return { argv: ["npm", "cache", "clean", "--force"] };
    if (error.includes("EACCES"))
      return { argv: ["chmod", "+x", String(data.file ?? "")].filter(Boolean) };
    if (error.includes("MODULE_NOT_FOUND")) return { argv: ["npm", "install"] };
    if (error.includes("ECONNREFUSED")) {
      return {
        argv: [
          process.execPath,
          "-e",
          'console.log("Connection refused - check if target service is running")',
        ],
      };
    }

    return {
      argv: [
        process.execPath,
        "-e",
        `console.log(${JSON.stringify(`Unrecognized error: ${error.slice(0, 100)}`)})`,
      ],
    };
  }

  private buildDiskCleanupCommand(): string {
    if (process.platform === "win32") {
      return 'powershell -Command "Get-ChildItem $env:TEMP -Recurse | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue"';
    }
    return 'find /tmp -maxdepth 1 -mtime +7 -exec rm -rf {} + 2>/dev/null; echo "Temp cleanup done"';
  }

  private buildShutdownWarningCommand(): string {
    if (process.platform === "win32") {
      return "powershell -Command \"Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('Low battery + idle. Consider saving work.', 'Parix')\"";
    }
    if (process.platform === "darwin") {
      return 'osascript -e \'display notification "Low battery + idle. Consider saving work." with title "Parix"\'';
    }
    return 'notify-send "Parix" "Low battery + idle. Consider saving work."';
  }

  private async execute(
    plan: ActionPlan,
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    console.log(
      `[ATRIUM] Executing: ${plan.taskType} (reversibility=${plan.reversibilityScore.toFixed(2)})`,
    );
    console.log(`[ATRIUM] Reasoning: ${plan.reasoning}`);

    const startMs = Date.now();

    audit({
      actor: "atrium",
      action: `execute:${plan.taskType}`,
      taskId: plan.id,
      payload: plan.payload,
    });
    logTask(plan.id, plan.taskType, "pending", JSON.stringify(plan.payload));

    try {
      let result: { success: boolean; output?: string; error?: string };

      if (plan.taskType === "notification") {
        const payload = plan.payload as unknown as NotificationPayload;
        await notify(payload);
        result = { success: true, output: "notification_dispatched" };
      } else if (plan.taskType === "skill") {
        result = await this.executeSkillPlan(plan);
      } else {
        const taskResult = await this.synapse.sendTask(
          plan.taskType,
          plan.payload,
        );
        result = {
          success: taskResult.success,
          output: taskResult.output,
          error: taskResult.error,
        };
      }

      const latencyMs = Date.now() - startMs;

      // Record to skill cache for future pattern matching
      const trigger = plan.reasoning.split(":")[0] ?? plan.taskType;
      recordSkill(
        trigger,
        plan.payload,
        plan.taskType,
        plan.payload,
        result.success,
        undefined,
        latencyMs,
      );

      if (!result.success && result.error) {
        dlqEnqueue(plan.id, plan.taskType, plan.payload, result.error);
      }

      audit({
        actor: "atrium",
        action: result.success ? "success" : "failure",
        taskId: plan.id,
      });
      updateTaskState(
        plan.id,
        result.success ? "completed" : "failed",
        result.output,
        result.error,
      );

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[ATRIUM] Execution failed: ${message}`);

      dlqEnqueue(plan.id, plan.taskType, plan.payload, message);

      audit({
        actor: "atrium",
        action: "error",
        taskId: plan.id,
        payload: { error: message },
      });
      updateTaskState(plan.id, "failed", undefined, message);

      return { success: false, error: message };
    }
  }

  private async executeSkillPlan(
    plan: ActionPlan,
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    const payload = plan.payload as Record<string, unknown>;
    const skillCalls = Array.isArray(payload.skillCalls)
      ? (payload.skillCalls as Array<{
          skillId: string;
          inputs: Record<string, unknown>;
        }>)
      : [
          // Legacy single-skill payload — wrap as a one-element fan-out.
          {
            skillId: String(payload.skillId ?? ""),
            inputs:
              (payload.inputs as Record<string, unknown> | undefined) ?? {},
          },
        ];

    if (skillCalls.length === 0 || !skillCalls[0].skillId) {
      return { success: false, error: "no skill specified in plan" };
    }

    // If any skill declares `accessibility:read`, surface the latest
    // focused-element snapshot as an extra input. Skills without the
    // permission don't see this data. Loaded lazily once and reused
    // across the fan-out.
    let a11yCache: Awaited<
      ReturnType<typeof import("../synapse/a11y-handler.js").getLatestAccessibility>
    > | null = null;
    let a11yLoaded = false;

    const result = await runSkillsInParallel(skillCalls, {
      autonomousMode: isAutonomousMode(),
      augmentInputs: async (reg, inputs) => {
        if (!reg.manifest.permissions.includes("accessibility:read")) {
          return inputs;
        }
        if (!a11yLoaded) {
          a11yCache = (
            await import("../synapse/a11y-handler.js")
          ).getLatestAccessibility();
          a11yLoaded = true;
        }
        if (!a11yCache) return inputs;
        return {
          ...inputs,
          _accessibility: {
            focusedApp: a11yCache.focusedApp,
            backendUsed: a11yCache.backendUsed,
            confidence: a11yCache.confidence,
            focusedElement: a11yCache.focusedElement,
          },
        };
      },
    });

    return {
      success: result.success,
      output: result.output,
      error: result.error,
    };
  }

  private enterError(err: Error): void {
    console.error(`[ATRIUM] ERROR: ${err.message}`);
    this.emit("error", err);

    if (this.thinkingTimer) {
      clearTimeout(this.thinkingTimer);
      this.thinkingTimer = null;
    }

    this.transition("ERROR");

    this.errorCooldownTimer = setTimeout(() => {
      console.log("[ATRIUM] Error cooldown complete — returning to IDLE");
      this.transition("IDLE");
      this.errorCooldownTimer = null;
      this.processQueue();
    }, ERROR_COOLDOWN_MS);
  }

  private async enterTokenBudgetPause(err: TokenBudgetExceededError): Promise<void> {
    console.error(`[ATRIUM] Token budget exhausted: ${err.message}`);

    if (this.thinkingTimer) {
      clearTimeout(this.thinkingTimer);
      this.thinkingTimer = null;
    }

    pause("token_budget_exceeded");
    if (this.state !== "IDLE") {
      this.transition("IDLE");
    }

    await notify({
      title: "Parix paused: token budget",
      body: err.message,
      urgency: "high",
    });

    if (this.listenerCount("error") > 0) {
      this.emit("error", err);
    }
  }

  getQueueDepth(): number {
    return this.eventQueue.length + this.intentQueue.length;
  }

  flush(): void {
    this.eventQueue = [];
    this.intentQueue = [];
  }

  /**
   * "Why did you do that?" — returns a human-readable explanation
   * of the most recent action, or a specific task by ID.
   */
  explain(taskId?: string): ActionExplanation | null {
    return explainAction(taskId);
  }

  /**
   * Called after resume — drain any events that queued while paused.
   */
  onResume(): void {
    if (this.eventQueue.length > 0 || this.intentQueue.length > 0) {
      console.log(
        `[ATRIUM] Draining ${this.eventQueue.length + this.intentQueue.length} queued event(s) after resume`,
      );
      this.processQueue();
    }
  }

  destroy(): void {
    if (this.errorCooldownTimer) clearTimeout(this.errorCooldownTimer);
    if (this.thinkingTimer) clearTimeout(this.thinkingTimer);
    this.flush();
  }
}
