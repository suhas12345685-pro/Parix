import { registerChannel } from "../types.js";
import type { NotificationPayload } from "../types.js";

const ilinkUrl = process.env.WECHAT_ILINK_URL;
const userId = process.env.WECHAT_DEFAULT_USER_ID;

registerChannel({
  id: "wechat",
  name: "WeChat",
  tier: "A",
  async send(payload: NotificationPayload): Promise<boolean> {
    if (!ilinkUrl || !userId) return false;
    console.log(`[wechat] → ${userId}: ${payload.title}`);
    return true;
  },
});
