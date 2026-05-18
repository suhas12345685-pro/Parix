import { registerChannel } from "../types.js";
import type { NotificationPayload } from "../types.js";

const wsUrl = process.env.WEBCHAT_WS_URL;

registerChannel({
  id: "webchat",
  name: "WebChat",
  tier: "A",
  async send(payload: NotificationPayload): Promise<boolean> {
    if (!wsUrl) return false;
    console.log(`[webchat] → ${wsUrl}: ${payload.title}`);
    return true;
  },
});
