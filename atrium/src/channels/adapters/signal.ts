import { registerChannel } from "../types.js";
import type { NotificationPayload } from "../types.js";

const account = process.env.SIGNAL_ACCOUNT;
const recipient = process.env.SIGNAL_DEFAULT_RECIPIENT;

registerChannel({
  id: "signal",
  name: "Signal",
  tier: "B",
  async send(payload: NotificationPayload): Promise<boolean> {
    if (!account || !recipient) return false;
    console.log(
      `[signal] → ${recipient}: ${payload.title} — ${payload.body.slice(0, 80)}`,
    );
    return true;
  },
});
