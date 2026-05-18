import { registerChannel } from "../types.js";
import type { NotificationPayload } from "../types.js";

const server = process.env.IRC_SERVER;
const nick = process.env.IRC_NICK;
const channels = process.env.IRC_CHANNELS;

registerChannel({
  id: "irc",
  name: "IRC",
  tier: "B",
  async send(payload: NotificationPayload): Promise<boolean> {
    if (!server || !nick) return false;
    console.log(
      `[irc] → ${channels ?? "#parix"}: ${payload.title}: ${payload.body.slice(0, 80)}`,
    );
    return true;
  },
});
