import { registerChannel } from "../intelligence/notify.js";
import type { NotificationPayload } from "./types.js";

type Fetcher = typeof fetch;

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;
let fetcher: Fetcher = fetch;

registerChannel({
  id: "telegram",
  name: "Telegram",
  tier: "A",
  async send(payload: NotificationPayload): Promise<boolean> {
    if (!botToken || !chatId) return false;

    const response = await fetcher(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: `*${escapeMarkdown(payload.title)}*\n${escapeMarkdown(payload.body)}`,
          parse_mode: "MarkdownV2",
          reply_markup: payload.actions?.length
            ? {
                inline_keyboard: [
                  payload.actions.map((action) => ({
                    text: action.label,
                    callback_data: action.value,
                  })),
                ],
              }
            : undefined,
        }),
      },
    );

    return response.ok;
  },
});

export function setTelegramFetcher(nextFetcher: Fetcher): void {
  fetcher = nextFetcher;
}

function escapeMarkdown(value: string): string {
  return value.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}
