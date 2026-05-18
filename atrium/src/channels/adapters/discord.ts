import { registerChannel } from "../types.js";
import type { NotificationPayload } from "../types.js";

const botToken = process.env.DISCORD_BOT_TOKEN;
const channelId = process.env.DISCORD_DEFAULT_CHANNEL_ID;

registerChannel({
  id: "discord",
  name: "Discord",
  tier: "A",
  async send(payload: NotificationPayload): Promise<boolean> {
    if (!botToken || !channelId) return false;
    const embed = {
      title: payload.title,
      description: payload.body,
      color:
        payload.urgency === "critical"
          ? 0xed4245
          : payload.urgency === "high"
            ? 0xfee75c
            : 0x5865f2,
      timestamp: new Date().toISOString(),
    };
    const res = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ embeds: [embed] }),
      },
    );
    return res.ok;
  },
});
