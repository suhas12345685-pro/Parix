import { getDb, persistToFile } from "../memory/db.js";

export interface StoredFact {
  key: string;
  value: string;
  kind: "preference" | "world" | "goal" | "routine" | "belief";
  confidence: number;
  evidence: string | null;
}

export function upsertFact(fact: StoredFact): void {
  getDb().run(
    `INSERT INTO cognitive_facts (key, value, kind, confidence, evidence, updated_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       kind = excluded.kind,
       confidence = excluded.confidence,
       evidence = excluded.evidence,
       updated_at = CURRENT_TIMESTAMP`,
    [fact.key, fact.value, fact.kind, fact.confidence, fact.evidence],
  );
}

export function getFacts(kind?: StoredFact["kind"], limit = 50): StoredFact[] {
  const sql = kind
    ? "SELECT key, value, kind, confidence, evidence FROM cognitive_facts WHERE kind = ? ORDER BY updated_at DESC LIMIT ?"
    : "SELECT key, value, kind, confidence, evidence FROM cognitive_facts ORDER BY updated_at DESC LIMIT ?";
  const params = kind ? [kind, limit] : [limit];
  const stmt = getDb().prepare(sql);
  stmt.bind(params);
  const rows: StoredFact[] = [];

  while (stmt.step()) {
    const [key, value, rowKind, confidence, evidence] = stmt.get();
    rows.push({
      key: String(key),
      value: String(value),
      kind: rowKind as StoredFact["kind"],
      confidence: Number(confidence),
      evidence: evidence === null ? null : String(evidence),
    });
  }

  stmt.free();
  return rows;
}

export function recordPreferenceSignal(
  signalType: string,
  data: Record<string, unknown>,
  weight: number,
): void {
  getDb().run(
    `INSERT INTO user_preference_signals (ts, signal_type, data, weight)
     VALUES (?, ?, ?, ?)`,
    [Date.now(), signalType, JSON.stringify(data), weight],
  );
}

export function recordCognitiveEpisode(
  id: string,
  triggerType: string,
  inferredGoal: string,
  desireJson: string,
  hypothesesJson: string,
  decisionJson: string,
  outcomeJson?: string,
): void {
  getDb().run(
    `INSERT INTO cognitive_episodes
       (id, ts, trigger_type, inferred_goal, desire_json, hypotheses_json, decision_json, outcome_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      Date.now(),
      triggerType,
      inferredGoal,
      desireJson,
      hypothesesJson,
      decisionJson,
      outcomeJson ?? null,
    ],
  );
  persistToFile();
}
