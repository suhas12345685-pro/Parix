import { getDb } from "../memory/db.js";

interface BucketConfig {
  maxPerMinute: number;
  maxPerHour: number;
  maxDailyTokens: number;
}

const DEFAULT_CONFIG: BucketConfig = {
  maxPerMinute: 5,
  maxPerHour: 60,
  maxDailyTokens: 100_000,
};

interface SpendRecord {
  taskType: string;
  ts: number;
}

class GovernorImpl {
  private config: BucketConfig;
  private recentSpends: SpendRecord[] = [];

  constructor(config: BucketConfig = DEFAULT_CONFIG) {
    this.config = config;
  }

  canSpend(taskTypeOrEstimatedTokens: string | number): boolean {
    this.pruneOldRecords();

    const now = Date.now();
    const oneMinuteAgo = now - 60_000;
    const oneHourAgo = now - 3_600_000;
    const estimatedTokens =
      typeof taskTypeOrEstimatedTokens === "number"
        ? Math.max(0, taskTypeOrEstimatedTokens)
        : 0;

    const lastMinute = this.recentSpends.filter((r) => r.ts > oneMinuteAgo);
    if (lastMinute.length >= this.config.maxPerMinute) {
      console.log(
        `[GOVERNOR] Rate limit: ${lastMinute.length}/${this.config.maxPerMinute} per minute`,
      );
      return false;
    }

    const lastHour = this.recentSpends.filter((r) => r.ts > oneHourAgo);
    if (lastHour.length >= this.config.maxPerHour) {
      console.log(
        `[GOVERNOR] Rate limit: ${lastHour.length}/${this.config.maxPerHour} per hour`,
      );
      return false;
    }

    if (!this.checkTokenBudget(estimatedTokens)) {
      console.log("[GOVERNOR] Daily token budget exhausted");
      return false;
    }

    return true;
  }

  recordSpend(taskType: string): void {
    this.recentSpends.push({ taskType, ts: Date.now() });
  }

  recordTokenUsage(
    provider: string,
    model: string,
    tokensIn: number,
    tokensOut: number,
    costUsd: number,
    taskId?: string,
  ): void {
    try {
      getDb().run(
        `INSERT INTO token_usage (provider, model, tokens_in, tokens_out, cost_usd, task_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [provider, model, tokensIn, tokensOut, costUsd, taskId ?? null],
      );
    } catch {
      // DB may not be initialized in tests
    }
  }

  private checkTokenBudget(estimatedTokens = 0): boolean {
    try {
      const stmt = getDb().prepare(
        `SELECT COALESCE(SUM(tokens_in + tokens_out), 0) as total
         FROM token_usage
         WHERE ts > datetime('now', '-1 day')`,
      );
      if (stmt.step()) {
        const vals = stmt.get();
        stmt.free();
        const total = Number(vals[0]) || 0;
        return total + estimatedTokens <= this.config.maxDailyTokens;
      }
      stmt.free();
      return true;
    } catch {
      return true;
    }
  }

  private pruneOldRecords(): void {
    const cutoff = Date.now() - 3_600_000;
    this.recentSpends = this.recentSpends.filter((r) => r.ts > cutoff);
  }

  getStats(): { lastMinute: number; lastHour: number } {
    this.pruneOldRecords();
    const now = Date.now();
    return {
      lastMinute: this.recentSpends.filter((r) => r.ts > now - 60_000).length,
      lastHour: this.recentSpends.length,
    };
  }

  updateConfig(partial: Partial<BucketConfig>): void {
    this.config = { ...this.config, ...partial };
  }
}

export const governor = new GovernorImpl();
