import type { ChannelAdapter, NotificationPayload, Urgency } from "./types.js";

export interface ChannelRouterOptions {
  channels: ChannelAdapter[];
  tierPreference?: Record<Urgency, string[]>;
}

export class ChannelRouter {
  private channels: Map<string, ChannelAdapter>;
  private tierPreference: Record<Urgency, string[]>;

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
  }

  async send(payload: NotificationPayload): Promise<boolean> {
    for (const channelId of this.channelIdsFor(payload.urgency)) {
      const channel = this.channels.get(channelId);
      if (!channel || !canSend(channel.tier, payload.urgency)) continue;
      if (await channel.send(payload)) return true;
    }
    return false;
  }

  channelIdsFor(urgency: Urgency): string[] {
    return this.tierPreference[urgency];
  }
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
