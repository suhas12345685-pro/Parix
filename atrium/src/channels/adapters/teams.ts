import { registerChannel } from "../types.js";
import type { NotificationPayload } from "../types.js";

const webhookUrl = process.env.TEAMS_WEBHOOK_URL;

registerChannel({
  id: "microsoft-teams",
  name: "Microsoft Teams",
  tier: "A",
  async send(payload: NotificationPayload): Promise<boolean> {
    if (!webhookUrl) return false;
    const card = {
      type: "message",
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: {
            $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
            type: "AdaptiveCard",
            version: "1.4",
            body: [
              {
                type: "TextBlock",
                text: payload.title,
                weight: "Bolder",
                size: "Medium",
              },
              { type: "TextBlock", text: payload.body, wrap: true },
            ],
          },
        },
      ],
    };
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(card),
    });
    return res.ok;
  },
});
