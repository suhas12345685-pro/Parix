/**
 * DB adapter — picks Postgres in prod (DATABASE_URL set), SQLite in dev.
 * Both expose the same query() Promise-returning surface so the route
 * handlers don't care which is in use.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, "../migrations");

export interface DbAdapter {
  kind: "postgres" | "sqlite";
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  close(): Promise<void>;
  migrate(): Promise<void>;
}

class PostgresAdapter implements DbAdapter {
  kind = "postgres" as const;
  private pool: import("pg").Pool;

  constructor(url: string) {
    // Lazy import so SQLite-only dev doesn't load `pg`.
    const { Pool } = require("pg") as typeof import("pg");
    this.pool = new Pool({ connectionString: url, max: 10 });
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const res = await this.pool.query(sql, params);
    return res.rows as T[];
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async migrate(): Promise<void> {
    for (const file of readdirSync(MIGRATIONS_DIR).sort()) {
      if (!file.endsWith(".sql")) continue;
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
      await this.pool.query(sql);
    }
  }
}

class SqliteAdapter implements DbAdapter {
  kind = "sqlite" as const;
  private db: any;

  constructor(path: string) {
    const Database = require("better-sqlite3");
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
  }

  // better-sqlite3 is sync; we wrap to match the Postgres async surface.
  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    const trimmed = sql.trim().toUpperCase();
    if (
      trimmed.startsWith("SELECT") ||
      trimmed.startsWith("WITH") ||
      trimmed.startsWith("PRAGMA")
    ) {
      return stmt.all(...params) as T[];
    }
    stmt.run(...params);
    return [];
  }

  async close(): Promise<void> {
    this.db.close();
  }

  async migrate(): Promise<void> {
    for (const file of readdirSync(MIGRATIONS_DIR).sort()) {
      if (!file.endsWith(".sql")) continue;
      let sql = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
      // Crude Postgres → SQLite munging. Good enough for v0.2.
      sql = sql
        .replace(/JSONB/g, "TEXT")
        .replace(/TIMESTAMPTZ/g, "DATETIME")
        .replace(/DEFAULT NOW\(\)/g, "DEFAULT CURRENT_TIMESTAMP")
        .replace(/SERIAL/g, "INTEGER")
        .replace(/'\[\]'::jsonb/g, "'[]'")
        .replace(/BOOLEAN/g, "INTEGER");
      // Split on `;` to run statements one at a time.
      for (const stmt of sql.split(/;\s*\n/)) {
        const s = stmt.trim();
        if (s) this.db.exec(s);
      }
    }
  }
}

export function makeDb(): DbAdapter {
  const url = process.env.DATABASE_URL?.trim();
  if (url) return new PostgresAdapter(url);
  const sqlitePath =
    process.env.MARKETPLACE_SQLITE_PATH ||
    resolve(__dirname, "../marketplace-dev.db");
  return new SqliteAdapter(sqlitePath);
}
