import { registerJob } from "../index.js";
import { getDb } from "../../memory/db.js";

export function registerTokenBudgetJob(intervalMs = 60_000): string {
  return registerJob("token-budget-check", intervalMs, () => {
    try {
      const stmt = getDb().prepare(
        `SELECT COALESCE(SUM(tokens_in + tokens_out), 0) as total
         FROM token_usage
         WHERE ts >= datetime('now', '-1 day')`,
      );
      if (stmt.step()) {
        const total = Number(stmt.get()[0]);
        if (total > 80_000) {
          console.log(
            `[SCHEDULER:TOKEN] Daily usage at ${total} tokens — approaching budget`,
          );
        }
      }
      stmt.free();
    } catch {
      // table may not exist yet
    }
  });
}
