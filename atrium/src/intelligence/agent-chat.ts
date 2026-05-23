/**
 * Shared act-first agent-chat handler.
 *
 * Every conversational surface — the Aegis dashboard chat and every inbound
 * messaging channel (Telegram, Slack, Discord, …) — routes user messages
 * through here so behaviour stays identical: try to ACT first via the engine,
 * report the real outcome, and only fall back to a conversational answer when
 * there is genuinely no action to take.
 */
import type { AtriumEngine, UserRequestOutcome } from "./council.js";

/** Immediate acknowledgement a surface can show before the work finishes. */
export const AGENT_ACK = "On it — working on that now…";

export function formatOutcome(outcome: UserRequestOutcome): string {
  const what =
    outcome.reasoning?.replace(/^User request:\s*/i, "") ?? "the task";
  if (outcome.success) {
    const trimmed = (outcome.output ?? "").trim();
    return trimmed
      ? `Done — ${what}\n\n${trimmed.slice(0, 1500)}`
      : `Done — ${what}`;
  }
  return `That didn't work — ${what}${
    outcome.error ? `\n\n${outcome.error.slice(0, 1000)}` : ""
  }`;
}

/**
 * Conversational fallback for messages the engine decided were not actionable
 * (questions, chitchat). Routed through the user's configured LLM.
 */
export async function answerConversationally(
  engine: AtriumEngine,
  message: string,
): Promise<string> {
  const llmRouter = engine.getLLMRouter();
  if (!llmRouter) {
    return "I can handle status, pause/stop, resume/start, flush queue, and explanation commands. Try 'help' for the exact phrases.";
  }
  try {
    const response = await llmRouter.complete(
      {
        prompt: `You are Parix, a premium AI assistant. The user is chatting with you.
Respond to the user directly, helpfully, and concisely (1-4 sentences).

User message: ${message}`,
        systemPrompt:
          "You are Parix, a helpful AI assistant. Provide concise, clear, and direct answers.",
        temperature: 0.7,
        maxTokens: 500,
      },
      "reasoning",
    );
    return response.text.trim();
  } catch (err) {
    console.error(`[AGENT-CHAT] LLM response generation failed:`, err);
    return `I encountered an error trying to process that with the LLM router: ${
      err instanceof Error ? err.message : String(err)
    }`;
  }
}

/**
 * Run one full agent turn for a free-text message and return the final reply
 * text. Acts first; falls back to a conversational answer only when no action
 * was taken. Surfaces that want a streaming UX can send {@link AGENT_ACK}
 * before awaiting this.
 */
export async function runAgentTurn(
  engine: AtriumEngine,
  message: string,
): Promise<string> {
  const outcome = await engine.runUserRequest(message);

  if (outcome.acted) return formatOutcome(outcome);

  if (outcome.blocked) {
    return (
      outcome.reasoning ??
      `I couldn't run that — ${outcome.blocked.replace(/_/g, " ")}.`
    );
  }

  return answerConversationally(engine, message);
}
