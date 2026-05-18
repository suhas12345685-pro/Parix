import { registerChannel } from "../types.js";
import type { NotificationPayload } from "../types.js";

const shipUrl = process.env.TLON_SHIP_URL;
const code = process.env.TLON_CODE;

registerChannel({
  id: "tlon",
  name: "Tlon",
  tier: "B",
  async send(payload: NotificationPayload): Promise<boolean> {
    if (!shipUrl || !code) return false;
    console.log(`[tlon] → ${shipUrl}: ${payload.title}`);
    return true;
  },
});
