import { getDb } from "../memory/db.js";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 10_000;

interface DeadLetterEntry {
  taskId: string;
  eventType: string;
  payload: string;
  attempts: number;
  lastError: string;
  createdAt: string;
  notified: boolean;
}

export function enqueue(
  taskId: string,
  eventType: string,
  payload: Record<string, unknown>,
  error: string,
): void {
  const payloadStr = JSON.stringify(payload);

  try {
    // Check if already in DLQ
    const existing = getDb().prepare(
      "SELECT attempts FROM dead_letter WHERE task_id = ?",
    );
    existing.bind([taskId]);

    if (existing.step()) {
      const attempts = Number(existing.get()[0]);
      existing.free();

      getDb().run(
        `UPDATE dead_letter
         SET attempts = ?, last_error = ?, notified = 0
         WHERE task_id = ?`,
        [attempts + 1, error, taskId],
      );

      console.log(`[ATRIUM:DLQ] Updated: ${taskId} (attempt ${attempts + 1})`);
    } else {
      existing.free();

      getDb().run(
        `INSERT INTO dead_letter (task_id, event_type, payload, attempts, last_error, created_at, notified)
         VALUES (?, ?, ?, 1, ?, CURRENT_TIMESTAMP, 0)`,
        [taskId, eventType, payloadStr, error],
      );

      console.log(`[ATRIUM:DLQ] Enqueued: ${taskId} (${eventType})`);
    }
  } catch (err) {
    console.error("[ATRIUM:DLQ] Failed to enqueue:", err);
  }
}

export function getRetryable(): DeadLetterEntry[] {
  try {
    const results: DeadLetterEntry[] = [];
    const stmt = getDb().prepare(
      `SELECT * FROM dead_letter
       WHERE attempts < ? AND notified = 0
       ORDER BY created_at ASC
       LIMIT 10`,
    );
    stmt.bind([MAX_RETRIES]);

    while (stmt.step()) {
      const cols = stmt.getColumnNames();
      const vals = stmt.get();
      const row: Record<string, unknown> = {};
      cols.forEach((c: string, i: number) => (row[c] = vals[i]));

      results.push({
        taskId: String(row.task_id),
        eventType: String(row.event_type),
        payload: String(row.payload),
        attempts: Number(row.attempts),
        lastError: String(row.last_error),
        createdAt: String(row.created_at),
        notified: Boolean(row.notified),
      });
    }
    stmt.free();
    return results;
  } catch {
    return [];
  }
}

export function getExhausted(): DeadLetterEntry[] {
  try {
    const results: DeadLetterEntry[] = [];
    const stmt = getDb().prepare(
      `SELECT * FROM dead_letter
       WHERE attempts >= ? AND notified = 0
       ORDER BY created_at ASC`,
    );
    stmt.bind([MAX_RETRIES]);

    while (stmt.step()) {
      const cols = stmt.getColumnNames();
      const vals = stmt.get();
      const row: Record<string, unknown> = {};
      cols.forEach((c: string, i: number) => (row[c] = vals[i]));

      results.push({
        taskId: String(row.task_id),
        eventType: String(row.event_type),
        payload: String(row.payload),
        attempts: Number(row.attempts),
        lastError: String(row.last_error),
        createdAt: String(row.created_at),
        notified: Boolean(row.notified),
      });
    }
    stmt.free();
    return results;
  } catch {
    return [];
  }
}

export function markNotified(taskId: string): void {
  try {
    getDb().run("UPDATE dead_letter SET notified = 1 WHERE task_id = ?", [
      taskId,
    ]);
  } catch {
    // ignore
  }
}

export function remove(taskId: string): void {
  try {
    getDb().run("DELETE FROM dead_letter WHERE task_id = ?", [taskId]);
  } catch {
    // ignore
  }
}

export function getRetryDelayMs(): number {
  return RETRY_DELAY_MS;
}

export function getStats(): { pending: number; exhausted: number } {
  try {
    const stmt = getDb().prepare(
      `SELECT
         COUNT(CASE WHEN attempts < ? THEN 1 END) as pending,
         COUNT(CASE WHEN attempts >= ? THEN 1 END) as exhausted
       FROM dead_letter WHERE notified = 0`,
    );
    stmt.bind([MAX_RETRIES, MAX_RETRIES]);
    if (stmt.step()) {
      const vals = stmt.get();
      stmt.free();
      return { pending: Number(vals[0]), exhausted: Number(vals[1]) };
    }
    stmt.free();
    return { pending: 0, exhausted: 0 };
  } catch {
    return { pending: 0, exhausted: 0 };
  }
}
