import { fuseContext, summarizeFusedContext } from "./context-fusion.js";

export interface ShadowPrompt {
  role: "system" | "user";
  content: string;
}

export function buildShadowPrompt(
  eventType: string,
  eventData: Record<string, unknown>,
  agentName: string,
  mode: string,
): ShadowPrompt[] {
  const ctx = fuseContext(eventType);
  const contextSummary = summarizeFusedContext(ctx);

  const prompts: ShadowPrompt[] = [
    {
      role: "system",
      content: `You are ${agentName}, a proactive ${mode} assistant. You observe system events and decide whether to act. Current context: ${contextSummary}. Only suggest actions that are reversible and safe.`,
    },
    {
      role: "user",
      content: buildEventPrompt(eventType, eventData),
    },
  ];

  return prompts;
}

function buildEventPrompt(
  eventType: string,
  data: Record<string, unknown>,
): string {
  switch (eventType) {
    case "terminal_error":
      return `A terminal error occurred: ${data.error ?? "unknown"}. Output: ${truncate(String(data.output ?? ""), 300)}. Suggest a fix command if appropriate.`;
    case "disk_low":
      return `Disk usage is critically high at ${data.percent ?? "?"}%. Suggest cleanup actions.`;
    case "cpu_high":
      return `CPU usage is elevated at ${data.percent ?? "?"}%. Identify likely cause and suggest resolution.`;
    case "memory_high":
      return `Memory usage is at ${data.percent ?? "?"}%. Suggest processes to investigate.`;
    case "battery_low":
      return `Battery is at ${data.percent ?? "?"}%. Consider reducing background work.`;
    default:
      return `Event "${eventType}" detected with data: ${truncate(JSON.stringify(data), 300)}. Assess whether action is needed.`;
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "..." : s;
}
