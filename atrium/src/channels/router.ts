import type { ChannelAdapter, NotificationPayload, Urgency } from "./types.js";
import { TokenBucket } from "../synapse/broker.js";

export interface ChannelRouterOptions {
  channels: ChannelAdapter[];
  tierPreference?: Record<Urgency, string[]>;
  backpressure?: {
    capacity: number;
    refillPerSecond: number;
  };
}

export class ChannelRouter {
  private channels: Map<string, ChannelAdapter>;
  private tierPreference: Record<Urgency, string[]>;
  private bucket: TokenBucket;

  constructor(options: ChannelRouterOptions) {
    this.channels = new Map(
      options.channels.map((channel) => [channel.id, channel]),
    );
    this.tierPreference = options.tierPreference ?? {
      critical: ["telegram", "webhook", "desktop"],
      high: ["telegram", "webhook", "desktop"],
      medium: ["webhook", "desktop", "telegram"],
      low: ["desktop", "webhook", "telegram"],
    };
    this.bucket = new TokenBucket(
      options.backpressure ?? {
        capacity: Number(process.env.PARIX_CHANNEL_TOKEN_BUCKET ?? 8_000),
        refillPerSecond: Number(process.env.PARIX_CHANNEL_REFILL_PER_SEC ?? 2_000),
      },
    );
  }

  async send(payload: NotificationPayload): Promise<boolean> {
    const cost = estimateNotificationCost(payload);
    if (!this.bucket.tryRemove(cost)) {
      return false;
    }

    for (const channelId of this.channelIdsFor(payload.urgency)) {
      const channel = this.channels.get(channelId);
      if (!channel || !canSend(channel.tier, payload.urgency)) continue;
      if (await channel.send(payload)) return true;
    }
    this.bucket.refund(Math.ceil(cost / 2));
    return false;
  }

  channelIdsFor(urgency: Urgency): string[] {
    return this.tierPreference[urgency];
  }
}

function estimateNotificationCost(payload: NotificationPayload): number {
  return Math.max(
    1,
    Math.ceil(
      `${payload.title}\n${payload.body}\n${payload.urgency}`.length / 4,
    ),
  );
}

const TIER_ORDER: Record<ChannelAdapter["tier"], number> = { A: 0, B: 1, C: 2 };
const URGENCY_TIER: Record<Urgency, ChannelAdapter["tier"]> = {
  critical: "A",
  high: "A",
  medium: "B",
  low: "C",
};

function canSend(
  channelTier: ChannelAdapter["tier"],
  urgency: Urgency,
): boolean {
  return TIER_ORDER[channelTier] <= TIER_ORDER[URGENCY_TIER[urgency]];
}
