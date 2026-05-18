import { registerChannel } from "../types.js";
import type { NotificationPayload } from "../types.js";

const channelToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const userId = process.env.LINE_DEFAULT_USER_ID;

registerChannel({
  id: "line",
  name: "LINE",
  tier: "A",
  async send(payload: NotificationPayload): Promise<boolean> {
    if (!channelToken || !userId) return false;
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${channelToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: userId,
        messages: [{ type: "text", text: `${payload.title}\n${payload.body}` }],
      }),
    });
    return res.ok;
  },
});
