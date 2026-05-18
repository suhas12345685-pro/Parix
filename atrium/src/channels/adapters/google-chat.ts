import { registerChannel } from "../types.js";
import type { NotificationPayload } from "../types.js";

const webhookUrl = process.env.GOOGLE_CHAT_WEBHOOK_URL;

registerChannel({
  id: "google-chat",
  name: "Google Chat",
  tier: "B",
  async send(payload: NotificationPayload): Promise<boolean> {
    if (!webhookUrl) return false;
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `*${payload.title}*\n${payload.body}` }),
    });
    return res.ok;
  },
});
