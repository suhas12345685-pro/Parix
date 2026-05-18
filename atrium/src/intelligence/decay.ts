import { getDb } from "../memory/db.js";

const DECAY_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_CONFIDENCE = 0.05;

export function decayConfidence(
  currentConfidence: number,
  ageMs: number,
): number {
  const factor = Math.pow(0.5, ageMs / DECAY_HALF_LIFE_MS);
  return Math.max(MIN_CONFIDENCE, currentConfidence * factor);
}

export function runDecayPass(): { updated: number; pruned: number } {
  const now = Date.now();
  let updated = 0;
  let pruned = 0;

  try {
    const rows: Array<{ key: string; confidence: number; updated_at: string }> =
      [];
    const stmt = getDb().prepare(
      "SELECT key, confidence, updated_at FROM cognitive_facts",
    );
    while (stmt.step()) {
      const [key, confidence, updatedAt] = stmt.get();
      rows.push({
        key: String(key),
        confidence: Number(confidence),
        updated_at: String(updatedAt),
      });
    }
    stmt.free();

    for (const row of rows) {
      const ageMs = now - new Date(row.updated_at).getTime();
      if (ageMs < 3_600_000) continue;

      const newConfidence = decayConfidence(row.confidence, ageMs);

      if (newConfidence <= MIN_CONFIDENCE) {
        getDb().run("DELETE FROM cognitive_facts WHERE key = ?", [row.key]);
        pruned++;
      } else if (Math.abs(newConfidence - row.confidence) > 0.01) {
        getDb().run("UPDATE cognitive_facts SET confidence = ? WHERE key = ?", [
          newConfidence,
          row.key,
        ]);
        updated++;
      }
    }
  } catch {
    // table may not exist yet
  }

  return { updated, pruned };
}
