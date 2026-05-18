import { registerJob } from "../index.js";
import { getDb } from "../../memory/db.js";

const MAX_EVENT_AGE_DAYS = 7;

export function registerEventCleanupJob(intervalMs = 3_600_000): string {
  return registerJob("event-cleanup", intervalMs, () => {
    try {
      getDb().run(`DELETE FROM events WHERE timestamp < datetime('now', ?)`, [
        `-${MAX_EVENT_AGE_DAYS} days`,
      ]);
      getDb().run(
        `DELETE FROM checkpoints WHERE id NOT IN (SELECT id FROM checkpoints ORDER BY ts DESC LIMIT 50)`,
      );
    } catch (err) {
      console.error(
        "[SCHEDULER:CLEANUP]",
        err instanceof Error ? err.message : err,
      );
    }
  });
}
