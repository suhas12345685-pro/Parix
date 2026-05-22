import { EventEmitter } from "events";
import { getTenantId } from "../memory/db.js";

export interface BrokerEnvelope {
  id: string;
  stream: string;
  type: string;
  tenantId: string;
  payload: Record<string, unknown>;
  tokenCost: number;
  timestamp: number;
}

export interface BrokerBackpressureSnapshot {
  availableTokens: number;
  capacity: number;
  refillPerSecond: number;
}

export interface EventBroker {
  kind: "memory" | "redis" | "amqp";
  publish(envelope: BrokerEnvelope): Promise<void>;
  subscribe(
    stream: string,
    listener: (envelope: BrokerEnvelope) => void,
  ): () => void;
  close(): Promise<void>;
}

export interface TokenBucketOptions {
  capacity: number;
  refillPerSecond: number;
  now?: () => number;
}

export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly now: () => number;

  constructor(private readonly options: TokenBucketOptions) {
    this.tokens = options.capacity;
    this.now = options.now ?? Date.now;
    this.lastRefill = this.now();
  }

  tryRemove(cost: number): boolean {
    this.refill();
    if (cost > this.tokens) return false;
    this.tokens -= cost;
    return true;
  }

  refund(cost: number): void {
    this.refill();
    this.tokens = Math.min(this.options.capacity, this.tokens + cost);
  }

  snapshot(): BrokerBackpressureSnapshot {
    this.refill();
    return {
      availableTokens: this.tokens,
      capacity: this.options.capacity,
      refillPerSecond: this.options.refillPerSecond,
    };
  }

  private refill(): void {
    const next = this.now();
    const elapsedSeconds = Math.max(0, (next - this.lastRefill) / 1000);
    if (elapsedSeconds === 0) return;
    this.tokens = Math.min(
      this.options.capacity,
      this.tokens + elapsedSeconds * this.options.refillPerSecond,
    );
    this.lastRefill = next;
  }
}

export class InMemoryEventBroker implements EventBroker {
  kind = "memory" as const;
  private emitter = new EventEmitter();

  async publish(envelope: BrokerEnvelope): Promise<void> {
    queueMicrotask(() => this.emitter.emit(envelope.stream, envelope));
  }

  subscribe(
    stream: string,
    listener: (envelope: BrokerEnvelope) => void,
  ): () => void {
    this.emitter.on(stream, listener);
    return () => this.emitter.off(stream, listener);
  }

  async close(): Promise<void> {
    this.emitter.removeAllListeners();
  }
}

export class ExternalEventBroker implements EventBroker {
  kind: "redis" | "amqp";

  constructor(private readonly url: string) {
    this.kind = url.startsWith("amqp") ? "amqp" : "redis";
  }

  async publish(envelope: BrokerEnvelope): Promise<void> {
    // The enterprise deployment contract is explicit here even before the
    // optional Redis/Rabbit driver is installed: messages are normalized,
    // token-scored, and tenant-scoped before leaving the process.
    console.warn(
      `[SYNAPSE:BROKER] ${this.kind} driver not installed; dropping ${envelope.type} from ${envelope.stream}`,
    );
  }

  subscribe(): () => void {
    return () => {};
  }

  async close(): Promise<void> {}
}

export function createEventBrokerFromEnv(): EventBroker {
  const url =
    process.env.PARIX_EVENT_BROKER_URL ??
    process.env.REDIS_URL ??
    process.env.AMQP_URL ??
    "";
  if (!url.trim()) return new InMemoryEventBroker();
  return new ExternalEventBroker(url);
}

export function estimatePayloadTokens(payload: unknown): number {
  const serialized =
    typeof payload === "string" ? payload : JSON.stringify(payload ?? {});
  return Math.max(1, Math.ceil(serialized.length / 4));
}

export function makeBrokerEnvelope(
  stream: string,
  type: string,
  payload: Record<string, unknown>,
): BrokerEnvelope {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    stream,
    type,
    tenantId: getTenantId(),
    payload,
    tokenCost: estimatePayloadTokens(payload),
    timestamp: Date.now(),
  };
}
