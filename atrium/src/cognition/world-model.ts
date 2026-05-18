import type { CognitiveEvent, WorldFact } from "./types.js";
import { getFacts, upsertFact } from "./store.js";

export function observeWorld(event: CognitiveEvent): void {
  const evidence = JSON.stringify([
    `${event.type}:${new Date(event.timestamp * 1000).toISOString()}`,
  ]);

  if (event.data.cwd || event.data.repo || event.data.project) {
    upsertFact({
      key: "active_project",
      value: String(event.data.project ?? event.data.repo ?? event.data.cwd),
      kind: "world",
      confidence: 0.7,
      evidence,
    });
  }

  if (event.data.app || event.data.active_app) {
    upsertFact({
      key: "active_app",
      value: String(event.data.app ?? event.data.active_app),
      kind: "world",
      confidence: 0.65,
      evidence,
    });
  }

  if (
    event.type === "disk_low" ||
    event.type === "memory_high" ||
    event.type === "cpu_high"
  ) {
    upsertFact({
      key: `machine_${event.type}`,
      value: JSON.stringify(event.data),
      kind: "world",
      confidence: event.confidence,
      evidence,
    });
  }
}

export function getWorldFacts(limit = 30): WorldFact[] {
  return getFacts("world", limit).map((fact) => ({
    key: fact.key,
    value: fact.value,
    confidence: fact.confidence,
    evidence: parseEvidence(fact.evidence),
  }));
}

function parseEvidence(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [String(parsed)];
  } catch {
    return [value];
  }
}
