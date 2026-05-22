import { registerChannel } from "../intelligence/notify.js";
import type { NotificationPayload } from "./types.js";
import type { AtriumEngine } from "../intelligence/council.js";
import { formatExplanation } from "../intelligence/explainability.js";

type Fetcher = typeof fetch;

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;
let fetcher: Fetcher = fetch;

let activeEngine: AtriumEngine | null = null;
let lastUpdateId = 0;
let isPolling = false;

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

export function registerTelegramEngine(engine: AtriumEngine): void {
  activeEngine = engine;
  if (botToken && chatId) {
    console.log("[TELEGRAM] Registering engine and starting inbound poller...");
    startPolling();
  } else {
    console.log("[TELEGRAM] Poller skipped — TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing in env");
  }
}

function startPolling() {
  if (isPolling) return;
  isPolling = true;

  console.log("[TELEGRAM] Inbound polling loop started");

  const poll = async () => {
    try {
      const res = await fetcher(
        `https://api.telegram.org/bot${botToken}/getUpdates?offset=${lastUpdateId + 1}&timeout=5`
      );
      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}`);
      }
      const data = await res.json();
      if (data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          lastUpdateId = Math.max(lastUpdateId, update.update_id);
          await handleUpdate(update);
        }
      }
    } catch (err) {
      console.error("[TELEGRAM] Poller error:", err instanceof Error ? err.message : err);
    }
    // Schedule next poll after 2 seconds
    setTimeout(poll, 2000);
  };

  void poll();
}

async function handleUpdate(update: any) {
  if (update.message && update.message.text) {
    const text = String(update.message.text).trim().toLowerCase();
    const messageChatId = update.message.chat?.id;

    // Security boundary: only reply to the authorized chat ID
    if (chatId && String(messageChatId) !== String(chatId)) {
      return;
    }

    if (text === "/why" || text === "why" || text === "/explain" || text === "explain") {
      if (!activeEngine) {
        await sendTelegramMessage("Agent engine is not ready.");
        return;
      }

      const explanation = activeEngine.explain();
      if (explanation) {
        const formatted = formatExplanation(explanation);
        await sendTelegramMessage(formatted);
      } else {
        await sendTelegramMessage("No recent actions to explain.");
      }
    } else if (text.startsWith("/explain ") || text.startsWith("explain ")) {
      if (!activeEngine) {
        await sendTelegramMessage("Agent engine is not ready.");
        return;
      }
      const parts = text.split(" ");
      const taskId = parts[1]?.trim();
      if (!taskId) {
        await sendTelegramMessage("Please specify a task ID, e.g. /explain taskId");
        return;
      }
      const explanation = activeEngine.explain(taskId);
      if (explanation) {
        const formatted = formatExplanation(explanation);
        await sendTelegramMessage(formatted);
      } else {
        await sendTelegramMessage(`No action found for task ${taskId}`);
      }
    }
  }
}

async function sendTelegramMessage(text: string): Promise<boolean> {
  if (!botToken || !chatId) return false;
  try {
    const response = await fetcher(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
        }),
      },
    );
    return response.ok;
  } catch (err) {
    console.error("[TELEGRAM] sendTelegramMessage error:", err);
    return false;
  }
}

function escapeMarkdown(value: string): string {
  return value.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}
