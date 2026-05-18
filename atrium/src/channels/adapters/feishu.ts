import { registerChannel } from "../types.js";
import type { NotificationPayload } from "../types.js";

const appId = process.env.FEISHU_APP_ID;
const appSecret = process.env.FEISHU_APP_SECRET;
const chatId = process.env.FEISHU_DEFAULT_CHAT_ID;

registerChannel({
  id: "feishu",
  name: "Feishu / Lark",
  tier: "A",
  async send(payload: NotificationPayload): Promise<boolean> {
    if (!appId || !appSecret || !chatId) return false;
    console.log(`[feishu] → ${chatId}: ${payload.title}`);
    return true;
  },
});
