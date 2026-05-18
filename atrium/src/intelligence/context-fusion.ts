import { getCurrentSignals } from "./situations.js";
import { recall } from "./episodes.js";
import { getLastCognitiveSnapshot } from "../cognition/index.js";

export interface FusedContext {
  signals: Array<{ type: string; confidence: number; ts: number }>;
  episodicRecall: Array<{ summary: string; relevance: number }>;
  cognitiveSnapshot: unknown;
  fusedAt: number;
}

export function fuseContext(trigger: string): FusedContext {
  const signals = getCurrentSignals().map((s) => ({
    type: s.type,
    confidence: s.confidence,
    ts: s.ts,
  }));

  const episodes = recall([trigger], [], 3).map((ep) => ({
    summary: ep.summary,
    relevance: 0.5,
  }));

  return {
    signals,
    episodicRecall: episodes,
    cognitiveSnapshot: getLastCognitiveSnapshot(),
    fusedAt: Date.now(),
  };
}

export function summarizeFusedContext(ctx: FusedContext): string {
  const parts: string[] = [];
  if (ctx.signals.length > 0) {
    parts.push(`${ctx.signals.length} active signal(s)`);
  }
  if (ctx.episodicRecall.length > 0) {
    parts.push(`${ctx.episodicRecall.length} relevant episode(s)`);
  }
  if (ctx.cognitiveSnapshot) {
    parts.push("cognitive snapshot available");
  }
  return parts.join(", ") || "no context available";
}
