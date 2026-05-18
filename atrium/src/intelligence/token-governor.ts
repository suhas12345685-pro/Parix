import { getDb } from "../memory/db.js";

const DAILY_TOKEN_LIMIT = 100_000;
const HOURLY_TOKEN_LIMIT = 20_000;

export function recordTokenUsage(
  provider: string,
  model: string,
  tokensIn: number,
  tokensOut: number,
  taskId?: string,
): void {
  const costUsd = estimateCost(provider, tokensIn, tokensOut);
  try {
    getDb().run(
      `INSERT INTO token_usage (provider, model, tokens_in, tokens_out, cost_usd, task_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [provider, model, tokensIn, tokensOut, costUsd, taskId ?? null],
    );
  } catch {
    // table may not exist
  }
}

export function getDailyUsage(): { tokens: number; costUsd: number } {
  try {
    const stmt = getDb().prepare(
      `SELECT COALESCE(SUM(tokens_in + tokens_out), 0), COALESCE(SUM(cost_usd), 0)
       FROM token_usage WHERE ts >= datetime('now', '-1 day')`,
    );
    if (stmt.step()) {
      const [tokens, cost] = stmt.get();
      stmt.free();
      return { tokens: Number(tokens), costUsd: Number(cost) };
    }
    stmt.free();
  } catch {
    // table may not exist
  }
  return { tokens: 0, costUsd: 0 };
}

export function getHourlyUsage(): number {
  try {
    const stmt = getDb().prepare(
      `SELECT COALESCE(SUM(tokens_in + tokens_out), 0)
       FROM token_usage WHERE ts >= datetime('now', '-1 hour')`,
    );
    if (stmt.step()) {
      const tokens = Number(stmt.get()[0]);
      stmt.free();
      return tokens;
    }
    stmt.free();
  } catch {
    // table may not exist
  }
  return 0;
}

export function isWithinBudget(): boolean {
  const daily = getDailyUsage();
  const hourly = getHourlyUsage();
  return daily.tokens < DAILY_TOKEN_LIMIT && hourly < HOURLY_TOKEN_LIMIT;
}

function estimateCost(
  provider: string,
  tokensIn: number,
  tokensOut: number,
): number {
  const rates: Record<string, [number, number]> = {
    anthropic: [0.003, 0.015],
    openai: [0.005, 0.015],
    groq: [0.0001, 0.0002],
    ollama: [0, 0],
    deepseek: [0.00014, 0.00028],
  };
  const [inRate, outRate] = rates[provider] ?? [0.001, 0.002];
  return (tokensIn / 1000) * inRate + (tokensOut / 1000) * outRate;
}
