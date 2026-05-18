import { getDb, persistToFile } from "../memory/db.js";
import type { Narrative } from "./horizon.js";
import { serializeForDb } from "./horizon.js";

export interface NarrativeRow {
  id: string;
  goal: string;
  summary: string;
  trigger: string;
  status: string;
  blocked_reason: string | null;
  started_at: string;
  last_activity_at: string;
  attempts_json: string;
}

export function saveNarrative(narrative: Narrative): void {
  const row = serializeForDb(narrative);
  getDb().run(
    `INSERT INTO narratives (id, goal, summary, trigger, status, blocked_reason, attempts_json, started_at, last_activity_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       goal = excluded.goal,
       summary = excluded.summary,
       trigger = excluded.trigger,
       status = excluded.status,
       blocked_reason = excluded.blocked_reason,
       attempts_json = excluded.attempts_json,
       last_activity_at = excluded.last_activity_at`,
    [
      row.id,
      row.goal,
      row.summary,
      row.trigger,
      row.status,
      row.blocked_reason,
      row.attempts_json,
      row.started_at,
      row.last_activity_at,
    ],
  );
  persistToFile();
}

export function loadNarratives(): NarrativeRow[] {
  const rows: NarrativeRow[] = [];

  let stmt: ReturnType<ReturnType<typeof getDb>["prepare"]>;
  try {
    stmt = getDb().prepare(
      "SELECT * FROM narratives WHERE status IN (?, ?) ORDER BY last_activity_at DESC",
    );
  } catch {
    // Table missing on first run or in isolated test envs — nothing to restore.
    return rows;
  }

  try {
    stmt.bind(["active", "blocked"]);
    while (stmt.step()) {
      const cols = stmt.getColumnNames();
      const vals = stmt.get();
      const row: Record<string, unknown> = {};
      cols.forEach((column: string, index: number) => {
        row[column] = vals[index];
      });
      rows.push(row as unknown as NarrativeRow);
    }
  } finally {
    stmt.free();
  }

  return rows;
}
