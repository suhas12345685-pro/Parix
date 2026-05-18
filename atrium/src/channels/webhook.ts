import { registerChannel } from "../intelligence/notify.js";
import type { NotificationPayload } from "./types.js";

type Fetcher = typeof fetch;

const url = process.env.PARIX_WEBHOOK_URL;
let fetcher: Fetcher = fetch;

registerChannel({
  id: "webhook",
  name: "Webhook",
  tier: "B",
  async send(payload: NotificationPayload): Promise<boolean> {
    if (!url) return false;
    const response = await fetcher(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return response.ok;
  },
});

export function setWebhookFetcher(nextFetcher: Fetcher): void {
  fetcher = nextFetcher;
}
