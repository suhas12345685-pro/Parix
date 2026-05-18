import { createHash } from "crypto";
import { getDb } from "../memory/db.js";

interface CachedSolution {
  patternHash: string;
  patternText: string;
  taskType: string;
  payload: Record<string, unknown>;
  successCount: number;
  failCount: number;
  modelUsed: string | null;
  avgLatencyMs: number;
}

function hashPattern(eventType: string, data: Record<string, unknown>): string {
  const normalized = [
    eventType,
    ...Object.keys(data)
      .sort()
      .map((k) => `${k}=${data[k]}`),
  ].join("|");
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

export function lookupSkill(
  eventType: string,
  data: Record<string, unknown>,
): CachedSolution | null {
  const hash = hashPattern(eventType, data);

  try {
    const stmt = getDb().prepare(
      `SELECT * FROM skill_cache WHERE pattern_hash = ? AND success_count > fail_count`,
    );
    stmt.bind([hash]);

    if (stmt.step()) {
      const cols = stmt.getColumnNames();
      const vals = stmt.get();
      const row: Record<string, unknown> = {};
      cols.forEach((c: string, i: number) => (row[c] = vals[i]));
      stmt.free();

      const solution = JSON.parse(String(row.solution_json));

      console.log(
        `[ATRIUM:SKILL] Cache hit: ${eventType} → ${solution.taskType} (${row.success_count} successes)`,
      );

      return {
        patternHash: hash,
        patternText: String(row.pattern_text),
        taskType: solution.taskType,
        payload: solution.payload,
        successCount: Number(row.success_count),
        failCount: Number(row.fail_count),
        modelUsed: row.model_used ? String(row.model_used) : null,
        avgLatencyMs: Number(row.avg_latency_ms ?? 0),
      };
    }

    stmt.free();
    return null;
  } catch {
    return null;
  }
}

export function recordSkill(
  eventType: string,
  data: Record<string, unknown>,
  taskType: string,
  payload: Record<string, unknown>,
  success: boolean,
  modelUsed?: string,
  latencyMs?: number,
): void {
  const hash = hashPattern(eventType, data);
  const patternText = `${eventType}:${JSON.stringify(data)}`;
  const solutionJson = JSON.stringify({ taskType, payload });

  try {
    // Try update first
    const existing = getDb().prepare(
      "SELECT success_count, fail_count, avg_latency_ms FROM skill_cache WHERE pattern_hash = ?",
    );
    existing.bind([hash]);

    if (existing.step()) {
      const vals = existing.get();
      existing.free();

      const oldSuccess = Number(vals[0]);
      const oldFail = Number(vals[1]);
      const oldLatency = Number(vals[2] ?? 0);

      const newSuccess = success ? oldSuccess + 1 : oldSuccess;
      const newFail = success ? oldFail : oldFail + 1;
      const newLatency = latencyMs
        ? Math.round(
            (oldLatency * (oldSuccess + oldFail) + latencyMs) /
              (oldSuccess + oldFail + 1),
          )
        : oldLatency;

      getDb().run(
        `UPDATE skill_cache
         SET success_count = ?, fail_count = ?, avg_latency_ms = ?,
             model_used = COALESCE(?, model_used),
             last_used_at = CURRENT_TIMESTAMP,
             solution_json = ?
         WHERE pattern_hash = ?`,
        [
          newSuccess,
          newFail,
          newLatency,
          modelUsed ?? null,
          solutionJson,
          hash,
        ],
      );
    } else {
      existing.free();

      getDb().run(
        `INSERT INTO skill_cache (pattern_hash, pattern_text, solution_json, success_count, fail_count, model_used, avg_latency_ms, last_used_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          hash,
          patternText,
          solutionJson,
          success ? 1 : 0,
          success ? 0 : 1,
          modelUsed ?? null,
          latencyMs ?? 0,
        ],
      );
    }
  } catch (err) {
    console.error("[ATRIUM:SKILL] Failed to record:", err);
  }
}

export function getSkillStats(): { totalPatterns: number; hitRate: number } {
  try {
    const stmt = getDb().prepare(
      "SELECT COUNT(*) as total, SUM(success_count) as hits, SUM(fail_count) as misses FROM skill_cache",
    );
    if (stmt.step()) {
      const vals = stmt.get();
      stmt.free();
      const total = Number(vals[0]);
      const hits = Number(vals[1] ?? 0);
      const misses = Number(vals[2] ?? 0);
      const hitRate = hits + misses > 0 ? hits / (hits + misses) : 0;
      return { totalPatterns: total, hitRate };
    }
    stmt.free();
    return { totalPatterns: 0, hitRate: 0 };
  } catch {
    return { totalPatterns: 0, hitRate: 0 };
  }
}
