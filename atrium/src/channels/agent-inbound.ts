/**
 * Inbound agent pipeline.
 *
 * Bridges incoming messages from any channel (Telegram, Slack, Discord, …) to
 * the engine's act-first handler and replies on the same thread. This is what
 * turns the channel adapters from notify-only into a real two-way messaging
 * agent: a message arrives → Parix tries to ACT → the outcome is sent back.
 */
import { onInboundMessage, type InboundChannelMessage } from "./inbound.js";
import { getChannel } from "../intelligence/notify.js";
import { AGENT_ACK, runAgentTurn } from "../intelligence/agent-chat.js";
import type { AtriumEngine } from "../intelligence/council.js";

let started = false;

export function startInboundAgent(engine: AtriumEngine): () => void {
  if (started) return () => {};
  started = true;
  console.log(
    "[CHANNELS] Inbound agent pipeline started — channel messages route to the engine",
  );

  return onInboundMessage(async (msg: InboundChannelMessage) => {
    const text = msg.text?.trim();
    if (!text) return;

    const channel = getChannel(msg.channelId);
    const reply = async (out: string): Promise<void> => {
      if (!channel?.reply) return;
      try {
        await channel.reply(msg.chatId, out);
      } catch (err) {
        console.error(
          `[CHANNELS] reply via ${msg.channelId} failed:`,
          err instanceof Error ? err.message : err,
        );
      }
    };

    console.log(`[CHANNELS] Inbound ${msg.channelId}: ${text.slice(0, 80)}`);
    await reply(AGENT_ACK);

    try {
      const result = await runAgentTurn(engine, text);
      await reply(result);
    } catch (err) {
      await reply(
        `I hit an error trying to do that: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });
}
