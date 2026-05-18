import { registerChannel } from "../types.js";
import type { NotificationPayload } from "../types.js";

const threadId = process.env.ZALO_PERSONAL_DEFAULT_THREAD_ID;

registerChannel({
  id: "zalo-personal",
  name: "Zalo Personal",
  tier: "A",
  async send(payload: NotificationPayload): Promise<boolean> {
    if (!threadId) return false;
    console.log(`[zalo-personal] → ${threadId}: ${payload.title}`);
    return true;
  },
});
