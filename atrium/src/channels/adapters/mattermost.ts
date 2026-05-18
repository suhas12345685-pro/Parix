import { registerChannel } from "../types.js";
import type { NotificationPayload } from "../types.js";

const url = process.env.MATTERMOST_URL;
const botToken = process.env.MATTERMOST_BOT_TOKEN;
const channelId = process.env.MATTERMOST_DEFAULT_CHANNEL_ID;

registerChannel({
  id: "mattermost",
  name: "Mattermost",
  tier: "A",
  async send(payload: NotificationPayload): Promise<boolean> {
    if (!url || !botToken || !channelId) return false;
    const res = await fetch(`${url}/api/v4/posts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel_id: channelId,
        message: `**${payload.title}**\n${payload.body}`,
      }),
    });
    return res.ok;
  },
});
