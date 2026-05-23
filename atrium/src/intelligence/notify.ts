import { getDb } from "../memory/db.js";

type Urgency = "critical" | "high" | "medium" | "low";

interface NotificationPayload {
  title: string;
  body: string;
  urgency: Urgency;
  taskId?: string;
  actions?: Array<{ label: string; value: string }>;
}

interface ChannelAdapter {
  id: string;
  name: string;
  tier: "A" | "B" | "C";
  send(payload: NotificationPayload): Promise<boolean>;
  /**
   * Reply to a specific inbound conversation. Implemented by channels that
   * support two-way messaging (Telegram, Slack, Discord, …). Used by the
   * inbound agent pipeline to answer the sender on their own thread.
   */
  reply?(chatId: string, text: string): Promise<boolean>;
}

// Channel registry — adapters register themselves here
const channels: Map<string, ChannelAdapter> = new Map();

// Urgency → minimum tier mapping
// A = rich actions, B = keyword replies, C = fire-and-forget
const URGENCY_TIER: Record<Urgency, "A" | "B" | "C"> = {
  critical: "A",
  high: "A",
  medium: "B",
  low: "C",
};

const TIER_ORDER: Record<string, number> = { A: 0, B: 1, C: 2 };

export function registerChannel(adapter: ChannelAdapter): void {
  channels.set(adapter.id, adapter);
  console.log(
    `[ATRIUM:NOTIFY] Registered channel: ${adapter.name} (tier ${adapter.tier})`,
  );
}

export function unregisterChannel(id: string): void {
  channels.delete(id);
}

export function getChannel(id: string): ChannelAdapter | undefined {
  return channels.get(id);
}

function getEnabledChannels(): string[] {
  try {
    const results: string[] = [];
    const stmt = getDb().prepare(
      "SELECT channel_id FROM channel_config WHERE enabled = 1",
    );
    while (stmt.step()) {
      results.push(String(stmt.get()[0]));
    }
    stmt.free();
    return results;
  } catch {
    // If no config table, all registered channels are enabled
    return Array.from(channels.keys());
  }
}

export async function dispatch(payload: NotificationPayload): Promise<boolean> {
  const minTier = URGENCY_TIER[payload.urgency];
  const enabledIds = new Set(getEnabledChannels());

  // Filter: must be registered, enabled, and meet minimum tier
  const eligible = Array.from(channels.values())
    .filter((ch) => enabledIds.has(ch.id))
    .filter((ch) => TIER_ORDER[ch.tier] <= TIER_ORDER[minTier])
    .sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);

  if (eligible.length === 0) {
    console.log(
      `[ATRIUM:NOTIFY] No channels available for urgency=${payload.urgency} (need tier >=${minTier})`,
    );
    // Fallback: console log the notification
    console.log(`[ATRIUM:NOTIFY] ${payload.title}: ${payload.body}`);
    return false;
  }

  let sent = false;

  for (const channel of eligible) {
    try {
      const ok = await channel.send(payload);
      if (ok) {
        console.log(
          `[ATRIUM:NOTIFY] Sent via ${channel.name}: ${payload.title}`,
        );
        sent = true;
        // For critical/high, send to ALL eligible channels
        // For medium/low, stop after first success
        if (payload.urgency === "medium" || payload.urgency === "low") {
          break;
        }
      }
    } catch (err) {
      console.error(
        `[ATRIUM:NOTIFY] ${channel.name} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (!sent) {
    console.log(`[ATRIUM:NOTIFY] All channels failed — logged to console`);
    console.log(`[ATRIUM:NOTIFY] ${payload.title}: ${payload.body}`);
  }

  return sent;
}

// Console fallback channel — always available
registerChannel({
  id: "console",
  name: "Console",
  tier: "C",
  async send(payload) {
    console.log(
      `[NOTIFICATION] [${payload.urgency.toUpperCase()}] ${payload.title}: ${payload.body}`,
    );
    return true;
  },
});

export type { NotificationPayload, ChannelAdapter, Urgency };
