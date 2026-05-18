import { registerChannel } from "../types.js";
import type { NotificationPayload } from "../types.js";

const bridgeUrl = process.env.IMSG_BRIDGE_URL;
const bridgeToken = process.env.IMSG_BRIDGE_TOKEN;
const defaultChat = process.env.IMSG_DEFAULT_CHAT;

registerChannel({
  id: "imessage",
  name: "iMessage",
  tier: "A",
  async send(payload: NotificationPayload): Promise<boolean> {
    if (!bridgeUrl || !bridgeToken || !defaultChat) return false;
    const res = await fetch(`${bridgeUrl}/api/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bridgeToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat: defaultChat,
        text: `${payload.title}\n${payload.body}`,
      }),
    });
    return res.ok;
  },
});
