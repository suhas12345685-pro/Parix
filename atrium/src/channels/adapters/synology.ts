import { registerChannel } from "../types.js";
import type { NotificationPayload } from "../types.js";

const webhookUrl = process.env.SYNOLOGY_CHAT_WEBHOOK_URL;

registerChannel({
  id: "synology-chat",
  name: "Synology Chat",
  tier: "B",
  async send(payload: NotificationPayload): Promise<boolean> {
    if (!webhookUrl) return false;
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `${payload.title}: ${payload.body}` }),
    });
    return res.ok;
  },
});
