import { registerJob } from "../index.js";
import { getDb } from "../../memory/db.js";

export function registerPendingConfigJob(intervalMs = 300_000): string {
  return registerJob("pending-config-check", intervalMs, () => {
    try {
      const stmt = getDb().prepare(
        "SELECT COUNT(*) FROM channel_config WHERE enabled = 1 AND config IS NULL",
      );
      if (stmt.step()) {
        const count = Number(stmt.get()[0]);
        if (count > 0) {
          console.log(
            `[SCHEDULER:CONFIG] ${count} channel(s) enabled but unconfigured`,
          );
        }
      }
      stmt.free();
    } catch {
      // table may not exist
    }
  });
}
