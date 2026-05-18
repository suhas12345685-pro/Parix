import { registerChannel } from "../types.js";
import type { NotificationPayload } from "../types.js";

const appId = process.env.QQ_BOT_APP_ID;
const token = process.env.QQ_BOT_TOKEN;
const targetId = process.env.QQ_DEFAULT_TARGET_ID;

registerChannel({
  id: "qq-bot",
  name: "QQ Bot",
  tier: "A",
  async send(payload: NotificationPayload): Promise<boolean> {
    if (!appId || !token || !targetId) return false;
    console.log(`[qq] → ${targetId}: ${payload.title}`);
    return true;
  },
});
