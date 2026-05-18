import type { CognitiveEvent, UserPreference } from "./types.js";
import { getFacts, recordPreferenceSignal, upsertFact } from "./store.js";

export function observeUserPreference(event: CognitiveEvent): void {
  if (event.type === "clipboard_sensitive_data") {
    learnPreference(
      "credential_workflow",
      "often configures API keys or secrets",
      0.65,
      event,
    );
  }
  if (event.type === "terminal_error") {
    learnPreference(
      "developer_workflow",
      "often works in command-line development loops",
      0.7,
      event,
    );
  }
  if (event.type === "silent:tab_overload") {
    learnPreference(
      "browser_heavy",
      "often keeps many browser tabs open while working",
      0.55,
      event,
    );
  }
}

export function getUserPreferences(limit = 30): UserPreference[] {
  return getFacts("preference", limit).map((fact) => ({
    key: fact.key,
    value: fact.value,
    confidence: fact.confidence,
    evidence: parseEvidence(fact.evidence),
  }));
}

function learnPreference(
  key: string,
  value: string,
  confidence: number,
  event: CognitiveEvent,
): void {
  const evidence = [
    `${event.type}:${new Date(event.timestamp * 1000).toISOString()}`,
  ];
  upsertFact({
    key,
    value,
    kind: "preference",
    confidence,
    evidence: JSON.stringify(evidence),
  });
  recordPreferenceSignal(event.type, event.data, confidence);
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
