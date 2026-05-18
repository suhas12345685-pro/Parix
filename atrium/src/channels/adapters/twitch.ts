import { registerChannel } from "../types.js";
import type { NotificationPayload } from "../types.js";

const oauthToken = process.env.TWITCH_OAUTH_TOKEN;
const channel = process.env.TWITCH_CHANNEL;

registerChannel({
  id: "twitch",
  name: "Twitch",
  tier: "B",
  async send(payload: NotificationPayload): Promise<boolean> {
    if (!oauthToken || !channel) return false;
    console.log(
      `[twitch] → #${channel}: ${payload.title}: ${payload.body.slice(0, 80)}`,
    );
    return true;
  },
});
