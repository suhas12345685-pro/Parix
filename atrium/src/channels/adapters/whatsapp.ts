import { registerChannel } from "../types.js";
import type { NotificationPayload } from "../types.js";

const defaultJid = process.env.WHATSAPP_DEFAULT_JID;

registerChannel({
  id: "whatsapp",
  name: "WhatsApp",
  tier: "A",
  async send(payload: NotificationPayload): Promise<boolean> {
    if (!defaultJid) return false;
    console.log(
      `[whatsapp] → ${defaultJid}: *${payload.title}* ${payload.body.slice(0, 80)}`,
    );
    return true;
  },
});
