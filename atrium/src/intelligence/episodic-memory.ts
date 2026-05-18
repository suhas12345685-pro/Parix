import { getDb, persistToFile } from "../memory/db.js";

export interface EpisodicMemory {
  id: number;
  summary: string;
  startTs: string;
  endTs: string;
  taskIds: string[];
  keyEntities: string[];
  outcome: string;
}

export function storeEpisode(
  summary: string,
  taskIds: string[],
  keyEntities: string[],
  outcome: string,
  startTs?: string,
  endTs?: string,
): void {
  const now = new Date().toISOString();
  try {
    getDb().run(
      `INSERT INTO episodes (summary, start_ts, end_ts, task_ids, key_entities, outcome)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        summary,
        startTs ?? now,
        endTs ?? now,
        JSON.stringify(taskIds),
        JSON.stringify(keyEntities),
        outcome,
      ],
    );
    persistToFile();
  } catch {
    // table may not exist
  }
}

export function searchEpisodes(query: string, limit = 5): EpisodicMemory[] {
  const results: EpisodicMemory[] = [];
  try {
    const stmt = getDb().prepare(
      `SELECT id, summary, start_ts, end_ts, task_ids, key_entities, outcome
       FROM episodes
       WHERE summary LIKE ? OR key_entities LIKE ?
       ORDER BY created_at DESC LIMIT ?`,
    );
    stmt.bind([`%${query}%`, `%${query}%`, limit]);
    while (stmt.step()) {
      const [id, summary, startTs, endTs, taskIds, keyEntities, outcome] =
        stmt.get();
      results.push({
        id: Number(id),
        summary: String(summary),
        startTs: String(startTs),
        endTs: String(endTs),
        taskIds: safeParse(String(taskIds)),
        keyEntities: safeParse(String(keyEntities)),
        outcome: String(outcome),
      });
    }
    stmt.free();
  } catch {
    // table may not exist
  }
  return results;
}

export function getRecentEpisodes(limit = 10): EpisodicMemory[] {
  return searchEpisodes("", limit);
}

function safeParse(json: string): string[] {
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
}
