import { registerChannel } from "../types.js";
import type { NotificationPayload } from "../types.js";

const accessToken = process.env.ZALO_ACCESS_TOKEN;
const userId = process.env.ZALO_DEFAULT_USER_ID;

registerChannel({
  id: "zalo",
  name: "Zalo",
  tier: "A",
  async send(payload: NotificationPayload): Promise<boolean> {
    if (!accessToken || !userId) return false;
    const res = await fetch("https://openapi.zalo.me/v2.0/oa/message", {
      method: "POST",
      headers: {
        access_token: accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipient: { user_id: userId },
        message: { text: `${payload.title}\n${payload.body}` },
      }),
    });
    return res.ok;
  },
});
