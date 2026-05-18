import { getDb } from "../memory/db.js";

export interface OptimizationReport {
  modelPerformance: Array<{
    provider: string;
    avgLatency: number;
    successRate: number;
  }>;
  slowestTaskTypes: Array<{ taskType: string; avgLatency: number }>;
  suggestions: string[];
}

export function analyzePerformance(): OptimizationReport {
  const modelPerf: Array<{
    provider: string;
    avgLatency: number;
    successRate: number;
  }> = [];
  const taskPerf: Array<{ taskType: string; avgLatency: number }> = [];
  const suggestions: string[] = [];

  try {
    const mStmt = getDb().prepare(
      `SELECT provider, AVG(latency_ms) as avg_lat, AVG(success) as avg_suc
       FROM model_performance
       WHERE ts >= datetime('now', '-7 days')
       GROUP BY provider
       ORDER BY avg_lat ASC`,
    );
    while (mStmt.step()) {
      const [provider, avgLat, avgSuc] = mStmt.get();
      modelPerf.push({
        provider: String(provider),
        avgLatency: Number(avgLat),
        successRate: Number(avgSuc),
      });
    }
    mStmt.free();

    const tStmt = getDb().prepare(
      `SELECT task_type, AVG(latency_ms) as avg_lat
       FROM model_performance
       WHERE ts >= datetime('now', '-7 days')
       GROUP BY task_type
       ORDER BY avg_lat DESC
       LIMIT 5`,
    );
    while (tStmt.step()) {
      const [taskType, avgLat] = tStmt.get();
      taskPerf.push({ taskType: String(taskType), avgLatency: Number(avgLat) });
    }
    tStmt.free();
  } catch {
    // tables may not exist
  }

  for (const m of modelPerf) {
    if (m.successRate < 0.8) {
      suggestions.push(
        `${m.provider} has low success rate (${(m.successRate * 100).toFixed(0)}%) — consider deprioritizing`,
      );
    }
    if (m.avgLatency > 5000) {
      suggestions.push(
        `${m.provider} is slow (${m.avgLatency}ms avg) — route simple tasks elsewhere`,
      );
    }
  }

  return {
    modelPerformance: modelPerf,
    slowestTaskTypes: taskPerf,
    suggestions,
  };
}

export function getProviderRecommendation(taskType: string): string | null {
  try {
    const stmt = getDb().prepare(
      `SELECT provider, AVG(latency_ms) as avg_lat, AVG(success) as avg_suc
       FROM model_performance
       WHERE task_type = ? AND ts >= datetime('now', '-7 days')
       GROUP BY provider
       HAVING avg_suc > 0.7
       ORDER BY avg_lat ASC
       LIMIT 1`,
    );
    stmt.bind([taskType]);
    if (stmt.step()) {
      const provider = String(stmt.get()[0]);
      stmt.free();
      return provider;
    }
    stmt.free();
  } catch {
    // table may not exist
  }
  return null;
}
