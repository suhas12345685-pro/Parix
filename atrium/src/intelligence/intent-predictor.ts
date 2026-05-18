import { getDb } from "../memory/db.js";

export interface PredictedIntent {
  nextEvent: string;
  confidence: number;
  basedOn: string;
}

export function predictNext(recentSequence: string[]): PredictedIntent | null {
  if (recentSequence.length < 2) return null;

  const pattern = recentSequence.slice(-3).join(" → ");

  try {
    const stmt = getDb().prepare(
      `SELECT next_event, COUNT(*) as cnt
       FROM event_sequences
       WHERE sequence = ?
       GROUP BY next_event
       ORDER BY cnt DESC
       LIMIT 1`,
    );
    stmt.bind([pattern]);
    if (stmt.step()) {
      const [nextEvent, cnt] = stmt.get();
      stmt.free();

      const totalStmt = getDb().prepare(
        "SELECT COUNT(*) FROM event_sequences WHERE sequence = ?",
      );
      totalStmt.bind([pattern]);
      let total = 1;
      if (totalStmt.step()) total = Math.max(1, Number(totalStmt.get()[0]));
      totalStmt.free();

      return {
        nextEvent: String(nextEvent),
        confidence: Number(cnt) / total,
        basedOn: pattern,
      };
    }
    stmt.free();
  } catch {
    // table may not exist
  }

  return null;
}

export function recordSequence(sequence: string[], nextEvent: string): void {
  if (sequence.length < 2) return;
  const pattern = sequence.slice(-3).join(" → ");
  try {
    getDb().run(
      "INSERT INTO event_sequences (sequence, next_event) VALUES (?, ?)",
      [pattern, nextEvent],
    );
  } catch {
    // table may not exist
  }
}

export function getTopPatterns(
  limit = 10,
): Array<{ sequence: string; nextEvent: string; count: number }> {
  const results: Array<{ sequence: string; nextEvent: string; count: number }> =
    [];
  try {
    const stmt = getDb().prepare(
      `SELECT sequence, next_event, COUNT(*) as cnt
       FROM event_sequences
       GROUP BY sequence, next_event
       ORDER BY cnt DESC
       LIMIT ?`,
    );
    stmt.bind([limit]);
    while (stmt.step()) {
      const [sequence, nextEvent, cnt] = stmt.get();
      results.push({
        sequence: String(sequence),
        nextEvent: String(nextEvent),
        count: Number(cnt),
      });
    }
    stmt.free();
  } catch {
    // table may not exist
  }
  return results;
}
