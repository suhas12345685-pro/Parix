import { registerChannel } from "../types.js";
import type { NotificationPayload } from "../types.js";

const pubkey = process.env.NOSTR_DEFAULT_PUBKEY;

registerChannel({
  id: "nostr",
  name: "Nostr",
  tier: "B",
  async send(payload: NotificationPayload): Promise<boolean> {
    if (!pubkey) return false;
    console.log(`[nostr] → ${pubkey.slice(0, 12)}...: ${payload.title}`);
    return true;
  },
});
