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
    if (trimmed) {
      return `### ✨ Task Executed Successfully\n\n**Goal**: *${what}*\n\n---\n\n${trimmed.slice(0, 1500)}`;
    }
    return `### ✨ Task Executed Successfully\n\nI have successfully executed the request: *${what}*.`;
  }
  return `### ⚠️ Task Execution Failed\n\n**Goal**: *${what}*\n\n**Error Details**:\n> ${
    outcome.error ? outcome.error.slice(0, 1000) : "An unknown error occurred during execution."
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
        prompt: `You are Parix, a mature, highly intelligent, and helpful AI assistant.
Respond to the user's message in a professional, clear, and friendly tone.
Use Markdown formatting (like bolding, bullet points, or inline code backticks) to make your response highly readable.
Keep your response concise but comprehensive (typically 2-4 sentences, or structured bullet points if answering a list-based question).

User message: ${message}`,
        systemPrompt:
          "You are Parix, a professional, direct, and mature AI assistant. Provide structured, clear, and helpful answers using markdown.",
        temperature: 0.7,
        maxTokens: 500,
      },
      "reasoning",
    );
    return (response.text ?? "").trim();
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
