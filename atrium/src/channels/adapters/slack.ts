import { registerChannel } from "../types.js";
import type { NotificationPayload } from "../types.js";

const botToken = process.env.SLACK_BOT_TOKEN;
const defaultChannel = process.env.SLACK_DEFAULT_CHANNEL_ID;

registerChannel({
  id: "slack",
  name: "Slack",
  tier: "A",
  async send(payload: NotificationPayload): Promise<boolean> {
    if (!botToken || !defaultChannel) return false;

    const blocks = [
      { type: "header", text: { type: "plain_text", text: payload.title } },
      { type: "section", text: { type: "mrkdwn", text: payload.body } },
    ];

    if (payload.actions?.length) {
      blocks.push({
        type: "actions" as any,
        elements: payload.actions.map((a) => ({
          type: "button",
          text: { type: "plain_text", text: a.label },
          value: a.value,
          action_id: `parix_${a.value}`,
        })),
      } as any);
    }

    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: defaultChannel,
        blocks,
        text: payload.title,
      }),
    });

    const data = (await res.json()) as { ok: boolean };
    return data.ok;
  },
});
