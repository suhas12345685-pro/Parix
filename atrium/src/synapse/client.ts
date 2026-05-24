import WebSocket from "ws";
import { EventEmitter } from "events";
import { v4 as uuid } from "uuid";
import { logTask, updateTaskState } from "../memory/db.js";
import { runPreflight } from "../middleware/preflight.js";
import {
  handleA11ySnapshot,
  type AccessibilitySnapshotMessage,
} from "./a11y-handler.js";
import {
  handleMultimodalRequest,
  type MultimodalRequestMessage,
  type MultimodalResponseMessage,
} from "./multimodal-handler.js";
import {
  createEventBrokerFromEnv,
  estimatePayloadTokens,
  makeBrokerEnvelope,
  TokenBucket,
  type EventBroker,
} from "./broker.js";
import { loadSynapseToken } from "./token.js";
import type { LLMRouter } from "../llm/router.js";

import protocol from "../../../shared/protocol.json" with { type: "json" };

const {
  ack_timeout_ms: ACK_TIMEOUT,
  reconnect: {
    max_retries: MAX_RETRIES,
    base_delay_ms: BASE_DELAY,
    max_delay_ms: MAX_DELAY,
  },
} = protocol;

type HandsStatus = "CONNECTED" | "DISCONNECTED" | "PARALYZED";

interface PendingTask {
  taskId: string;
  sentAt: number;
  resolve: (result: TaskResult) => void;
  reject: (error: Error) => void;
  ackTimer: ReturnType<typeof setTimeout>;
}

interface TaskResult {
  task_id: string;
  success: boolean;
  output: string;
  error?: string;
  timestamp: number;
}

export interface SynapseEvents {
  state_change: (status: HandsStatus) => void;
  sensor_event: (event: any) => void;
  silent_intent: (event: any) => void;
  reboot_sync: () => void;
  pause_toggle: () => void;
  "synapse:error": (err: Error) => void;
  error: (err: Error) => void;
}

export class SynapseClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private pending = new Map<string, PendingTask>();
  private status: HandsStatus = "DISCONNECTED";
  private retryCount = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalDisconnect = false;
  private url: string;
  private llmRouter: LLMRouter | null = null;
  private token: string | null;
  private broker: EventBroker;
  private ingressBucket = new TokenBucket({
    capacity: Number(process.env.PARIX_INGRESS_TOKEN_BUCKET ?? 2_000_000),
    refillPerSecond: Number(process.env.PARIX_INGRESS_REFILL_PER_SEC ?? 500_000),
  });
  private worldState: { lastTask: string | null; activeState: string } = {
    lastTask: null,
    activeState: "IDLE",
  };

  constructor(port = protocol.ports.synapse) {
    super();
    this.url = process.env.HANDS_WS_URL || `ws://localhost:${port}`;
    this.token = loadSynapseToken();
    this.broker = createEventBrokerFromEnv();
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.intentionalDisconnect = false;
    console.log(`[SYNAPSE] Connecting to ${this.url}...`);
    this.ws = new WebSocket(this.url);

    this.ws.on("open", () => {
      console.log("[SYNAPSE] Connected to Hands");
      this.retryCount = 0;
      if (this.token) {
        this.send({
          type: "SYNAPSE_AUTH",
          token: this.token,
          timestamp: Date.now() / 1000,
        });
      }
      this.setStatus("CONNECTED");
      this.pushWorldState();
    });

    this.ws.on("message", (raw: Buffer) => {
      this.handleMessage(raw.toString());
    });

    this.ws.on("close", () => {
      console.log("[SYNAPSE] Connection closed");
      this.setStatus("DISCONNECTED");
      this.rejectAllPending("Connection closed");
      if (!this.intentionalDisconnect) {
        this.scheduleReconnect();
      }
    });

    this.ws.on("error", (err: Error) => {
      console.error("[SYNAPSE] WebSocket error:", err.message);
      this.emit("error", err);
    });
  }

  async sendTask(
    type: string,
    payload: Record<string, unknown>,
  ): Promise<TaskResult> {
    const taskId = uuid();

    const preflight = runPreflight(
      { taskId, type, payload, requiresHands: true },
      { handsStatus: this.status },
    );
    if (!preflight.pass) {
      logTask(taskId, type, "failed", JSON.stringify(payload));
      updateTaskState(taskId, "failed", undefined, preflight.reason);
      throw new Error(`[${preflight.code}] ${preflight.reason}`);
    }

    logTask(taskId, type, "pending", JSON.stringify(payload));

    const msg = JSON.stringify({
      type: "TASK_REQUEST",
      task_id: taskId,
      task_type: type,
      payload,
      timestamp: Date.now() / 1000,
    });

    return new Promise<TaskResult>((resolve, reject) => {
      const ackTimer = setTimeout(() => {
        const pending = this.pending.get(taskId);
        if (pending) {
          this.pending.delete(taskId);
          this.setStatus("PARALYZED");
          updateTaskState(taskId, "failed", undefined, "ACK timeout");
          reject(
            new Error(`ACK timeout for task ${taskId} (>${ACK_TIMEOUT}ms)`),
          );
        }
      }, ACK_TIMEOUT);

      this.pending.set(taskId, {
        taskId,
        sentAt: Date.now(),
        resolve,
        reject,
        ackTimer,
      });
      const ws = this.ws;
      if (ws?.readyState !== WebSocket.OPEN) {
        clearTimeout(ackTimer);
        this.pending.delete(taskId);
        updateTaskState(taskId, "failed", undefined, "WebSocket is not open");
        reject(new Error("WebSocket is not open"));
        return;
      }
      ws.send(msg);
      console.log(`[SYNAPSE] Sent TASK_REQUEST: ${taskId} (${type})`);
    });
  }

  sendHeartbeat(): void {
    this.send({ type: "HEARTBEAT", timestamp: Date.now() / 1000 });
  }

  updateWorldState(lastTask: string | null, activeState: string): void {
    this.worldState = { lastTask, activeState };
  }

  setLLMRouter(router: LLMRouter | null): void {
    this.llmRouter = router;
  }

  private pushWorldState(): void {
    this.send({
      type: "WORLD_STATE_PUSH",
      last_task: this.worldState.lastTask,
      active_state: this.worldState.activeState,
      timestamp: Date.now() / 1000,
    });
    console.log("[SYNAPSE] Pushed world state to Hands");
  }

  private handleMessage(raw: string): void {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch (err) {
      const snippet = raw.slice(0, 200);
      const reason = err instanceof Error ? err.message : String(err);
      const parseError = new Error(
        `Malformed Synapse payload: ${reason}; snippet=${snippet}`,
      );
      console.error("[SYNAPSE] Malformed message:", snippet, reason);
      this.emit("synapse:error", parseError);
      return;
    }

    const type = msg.type;
    const tokenCost = estimatePayloadTokens(msg);
    if (this.shouldThrottle(type, tokenCost)) {
      const err = new Error(
        `Synapse ingress backpressure held ${type} (${tokenCost} token estimate)`,
      );
      console.warn("[SYNAPSE] Backpressure:", err.message);
      this.emit("synapse:error", err);
      return;
    }

    void this.broker.publish(
      makeBrokerEnvelope("synapse.ingress", type ?? "UNKNOWN", msg),
    );

    switch (type) {
      case "TASK_ACK":
        this.handleAck(msg);
        break;
      case "TASK_RESULT":
        this.handleResult(msg);
        break;
      case "SENSOR_EVENT":
        this.emit("sensor_event", msg);
        break;
      case "SILENT_INTENT_EVENT":
        this.emit("silent_intent", msg);
        break;
      case "ACCESSIBILITY_SNAPSHOT":
        handleA11ySnapshot(msg as AccessibilitySnapshotMessage);
        this.emit("accessibility_snapshot", msg);
        break;
      case "MULTIMODAL_REQUEST":
        void handleMultimodalRequest(
          msg as MultimodalRequestMessage,
          this.llmRouter,
          (response: MultimodalResponseMessage) =>
            this.send(response as unknown as Record<string, unknown>),
        );
        break;
      case "REBOOT_SYNC":
        console.log("[SYNAPSE] Received REBOOT_SYNC from Hands");
        this.pushWorldState();
        this.emit("reboot_sync");
        break;
      case "PAUSE_TOGGLE":
        console.log("[SYNAPSE] Received PAUSE_TOGGLE from Hands");
        this.emit("pause_toggle");
        break;
      case "HEARTBEAT":
        break;
      case "SYNAPSE_AUTH_OK":
        console.log("[SYNAPSE] AUTH ok");
        break;
      case "SYNAPSE_AUTH_ERROR":
        console.error(
          "[SYNAPSE] AUTH rejected by Hands:",
          msg.reason ?? "unknown",
        );
        this.emit(
          "error",
          new Error(`Synapse AUTH rejected: ${msg.reason ?? "unknown"}`),
        );
        break;
      case "ERROR":
        console.error("[SYNAPSE] Error from Hands:", msg.message);
        this.emit("error", new Error(msg.message));
        break;
      default:
        console.warn("[SYNAPSE] Unknown message type:", type);
    }
  }

  private handleAck(msg: any): void {
    const pending = this.pending.get(msg.task_id);
    if (!pending) return;

    clearTimeout(pending.ackTimer);
    updateTaskState(msg.task_id, "acked");
    console.log(`[SYNAPSE] ACK received for ${msg.task_id}`);

    if (this.status === "PARALYZED") {
      this.setStatus("CONNECTED");
    }
  }

  private handleResult(msg: any): void {
    const pending = this.pending.get(msg.task_id);
    if (!pending) {
      console.warn(`[SYNAPSE] Result for unknown task: ${msg.task_id}`);
      return;
    }

    this.pending.delete(msg.task_id);
    clearTimeout(pending.ackTimer);

    const state = msg.success ? "completed" : "failed";
    updateTaskState(msg.task_id, state, msg.output, msg.error);

    console.log(`[SYNAPSE] RESULT for ${msg.task_id}: success=${msg.success}`);
    pending.resolve(msg as TaskResult);
  }

  private setStatus(status: HandsStatus): void {
    if (this.status === status) return;
    const prev = this.status;
    this.status = status;
    console.log(`[SYNAPSE] Status: ${prev} → ${status}`);
    this.emit("state_change", status);
  }

  private rejectAllPending(reason: string): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.ackTimer);
      updateTaskState(id, "failed", undefined, reason);
      pending.reject(new Error(reason));
    }
    this.pending.clear();
  }

  private scheduleReconnect(): void {
    if (this.retryCount >= MAX_RETRIES) {
      console.error("[SYNAPSE] Max reconnect attempts reached");
      return;
    }

    const delay = Math.min(
      BASE_DELAY * Math.pow(2, this.retryCount),
      MAX_DELAY,
    );
    this.retryCount++;
    console.log(
      `[SYNAPSE] Reconnecting in ${delay}ms (attempt ${this.retryCount}/${MAX_RETRIES})`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private send(msg: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private shouldThrottle(type: unknown, tokenCost: number): boolean {
    const msgType = String(type ?? "");
    const throttleable = new Set([
      "SENSOR_EVENT",
      "SILENT_INTENT_EVENT",
      "ACCESSIBILITY_SNAPSHOT",
    ]);
    if (!throttleable.has(msgType)) return false;
    return !this.ingressBucket.tryRemove(tokenCost);
  }

  getStatus(): HandsStatus {
    return this.status;
  }

  getPendingCount(): number {
    return this.pending.size;
  }

  disconnect(): void {
    this.intentionalDisconnect = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.rejectAllPending("Client disconnecting");
    this.ws?.close();
    this.ws = null;
    void this.broker.close();
    this.setStatus("DISCONNECTED");
  }
}
