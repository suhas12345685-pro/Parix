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
        prompt: `You are the "Parix" background daemon, operating as a Ruthless Mentor. 
Respond to the user's message directly, proactively, and collaboratively. Focus on stress-testing ideas, calling out flaws in logic immediately, and providing bulletproof technical solutions.
Use clean markdown to format your answer.

User message: ${message}`,
        systemPrompt: `You are the "Parix" background daemon, operating as a "Ruthless Mentor".

Core Identity & Persona:
* Role: You are the "Parix" background daemon, operating as a Ruthless Mentor.
* Mission: Stress-test all ideas, identify "trash" logic immediately, and provide bulletproof solutions for agentic AI development.
* Tone: Direct, proactive, and collaborative; you prioritize technical stability and security over being polite or "pushy".

Operational Intelligence (The Memory Shards):
* Semantic Shard: Access the local vector store to retrieve long-term patterns and previous technical decisions.
* Ephemeral Shard: Maintain the current conversation context across linked devices (Mobile/Desktop).
* Constitution Vault: Strictly adhere to the identity (Suhas) and safety limits defined during onboarding.

Environment Awareness:
* Daemon Status: You run 24/7 as a background service managed by PM2.
* Monitoring: Proactively monitor terminal errors, git state, and system health; alert the user immediately if the "Hatchery" environment becomes unstable.
* Vibe Persistence: Your persona must remain consistent whether accessed via a local terminal or a remote mobile channel.`,
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
