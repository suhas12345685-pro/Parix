import initSqlJs, { type Database } from "sql.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

let db: Database;
let dbPath: string;
let saveTimer: ReturnType<typeof setInterval> | null = null;
let activeStore: MemoryStore | null = null;

export type MemoryStoreKind = "sqljs" | "postgres";

export interface MemoryQueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
}

export interface MemoryStore {
  kind: MemoryStoreKind;
  tenantId: string;
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<MemoryQueryResult<T>>;
  close(): Promise<void>;
  migrate(): Promise<void>;
}

export interface InitMemoryStoreOptions {
  databaseUrl?: string;
  path?: string;
  tenantId?: string;
}

const TENANT_TABLES = [
  "tasks",
  "events",
  "checkpoints",
  "llm_config",
  "dead_letter",
  "user_context",
  "feedback",
  "skill_cache",
  "model_performance",
  "event_sequences",
  "token_usage",
  "episodes",
  "situations",
  "recall_log",
  "surprises",
  "audit_ledger",
  "channel_config",
  "onboarding_state",
  "cognitive_facts",
  "cognitive_episodes",
  "user_preference_signals",
  "cron_tasks",
  "skill_setup",
  "learnings",
  "storage_credentials",
  "storage_sync_state",
  "plan_trees",
  "narratives",
  "calibration_records",
  "attention_log",
  "pulse_memory",
  "error_shadow_drafts",
  "dependency_foresight_drafts",
  "accessibility_snapshots",
  "cognition_metrics",
  "evolution_ledger",
  "benchmark_suite",
];

export function getTenantId(): string {
  return process.env.PARIX_TENANT_ID?.trim() || "local";
}

export function getDb(): Database {
  if (!db) throw new Error("Database not initialized — call initDb() first");
  return db;
}

export async function initDb(path?: string): Promise<Database> {
  dbPath = path ?? resolve(__dirname, "../../../data/memory.db");
  const dir = dirname(dbPath);
  mkdirSync(dir, { recursive: true });

  const SQL = await initSqlJs();

  if (existsSync(dbPath)) {
    const buffer = readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  const schema = readFileSync(
    resolve(__dirname, "../../../shared/schema.sql"),
    "utf-8",
  );
  db.run(schema);
  ensureTenantColumns();

  if (saveTimer) clearInterval(saveTimer);
  saveTimer = setInterval(() => persistToFile(), 30_000);
  activeStore = new SqlJsMemoryStore(getTenantId());

  return db;
}

export async function initMemoryStore(
  options: InitMemoryStoreOptions = {},
): Promise<MemoryStore> {
  const databaseUrl =
    options.databaseUrl ??
    process.env.SUPABASE_DB_URL ??
    process.env.DATABASE_URL ??
    "";
  const tenantId = options.tenantId ?? getTenantId();

  if (databaseUrl.trim()) {
    const store = await PostgresMemoryStore.connect(databaseUrl, tenantId);
    await store.migrate();
    activeStore = store;
    return store;
  }

  await initDb(options.path);
  activeStore = new SqlJsMemoryStore(tenantId);
  return activeStore;
}

export function getMemoryStore(): MemoryStore {
  if (!activeStore) {
    throw new Error("Memory store not initialized - call initMemoryStore() first");
  }
  return activeStore;
}

export function persistToFile(): void {
  if (!db || !dbPath) return;
  const data = db.export();
  writeFileSync(dbPath, Buffer.from(data));
}

class SqlJsMemoryStore implements MemoryStore {
  kind = "sqljs" as const;

  constructor(public tenantId: string) {}

  async query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<MemoryQueryResult<T>> {
    const trimmed = sql.trim().toUpperCase();
    if (trimmed.startsWith("SELECT") || trimmed.startsWith("WITH") || trimmed.startsWith("PRAGMA")) {
      const rows = all<T>(sql, params as any[]);
      return { rows, rowCount: rows.length };
    }

    getDb().run(sql, params as any[]);
    persistToFile();
    return { rows: [], rowCount: 0 };
  }

  async migrate(): Promise<void> {
    ensureTenantColumns();
  }

  async close(): Promise<void> {
    closeDb();
  }
}

class PostgresMemoryStore implements MemoryStore {
  kind = "postgres" as const;

  private constructor(
    public tenantId: string,
    private pool: any,
  ) {}

  static async connect(url: string, tenantId: string): Promise<PostgresMemoryStore> {
    const dynamicImport = new Function(
      "specifier",
      "return import(specifier)",
    ) as (specifier: string) => Promise<any>;
    const { Pool } = await dynamicImport("pg");
    const pool = new Pool({
      connectionString: url,
      max: Number(process.env.PARIX_PG_POOL_MAX ?? 20),
      idleTimeoutMillis: Number(process.env.PARIX_PG_IDLE_TIMEOUT_MS ?? 30_000),
      connectionTimeoutMillis: Number(
        process.env.PARIX_PG_CONNECT_TIMEOUT_MS ?? 5_000,
      ),
    });
    return new PostgresMemoryStore(tenantId, pool);
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<MemoryQueryResult<T>> {
    const result = await this.pool.query(toPostgresSql(sql), params);
    return {
      rows: result.rows as T[],
      rowCount: result.rowCount ?? result.rows.length,
    };
  }

  async migrate(): Promise<void> {
    const schemaPath = resolve(__dirname, "../../../shared/schema.postgres.sql");
    if (!existsSync(schemaPath)) return;
    await this.pool.query(readFileSync(schemaPath, "utf-8"));
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

function toPostgresSql(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function ensureTenantColumns(): void {
  for (const table of TENANT_TABLES) {
    try {
      getDb().run(
        `ALTER TABLE ${table} ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'local'`,
      );
    } catch {
      // Existing column, missing table in partial test schema, or SQLite variant.
    }
    try {
      getDb().run(
        `CREATE INDEX IF NOT EXISTS idx_${table}_tenant ON ${table}(tenant_id)`,
      );
    } catch {
      // Same best-effort compatibility path as the ALTER above.
    }
  }
  try {
    getDb().run("ALTER TABLE calibration_records ADD COLUMN skill_manifest_id TEXT");
  } catch {
    // Existing column or partial schema.
  }
  try {
    getDb().run("ALTER TABLE plan_trees ADD COLUMN graph_json TEXT NOT NULL DEFAULT '{}'");
  } catch {
    // Existing column or partial schema.
  }
}

function run(sql: string, params: any[] = []): void {
  getDb().run(sql, params);
  persistToFile();
}

function get<T = any>(sql: string, params: any[] = []): T | undefined {
  const stmt = getDb().prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const cols = stmt.getColumnNames();
    const vals = stmt.get();
    stmt.free();
    const obj: any = {};
    cols.forEach((c: string, i: number) => (obj[c] = vals[i]));
    return obj as T;
  }
  stmt.free();
  return undefined;
}

function all<T = any>(sql: string, params: any[] = []): T[] {
  const results: T[] = [];
  const stmt = getDb().prepare(sql);
  stmt.bind(params);
  while (stmt.step()) {
    const cols = stmt.getColumnNames();
    const vals = stmt.get();
    const obj: any = {};
    cols.forEach((c: string, i: number) => (obj[c] = vals[i]));
    results.push(obj as T);
  }
  stmt.free();
  return results;
}

export function logTask(
  taskId: string,
  type: string,
  state: string,
  payload?: string,
): void {
  run(
    `INSERT INTO tasks (tenant_id, task_id, type, state, payload)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(task_id) DO UPDATE SET
       state = excluded.state,
       updated_at = CURRENT_TIMESTAMP`,
    [getTenantId(), taskId, type, state, payload ?? null],
  );
}

export function updateTaskState(
  taskId: string,
  state: string,
  result?: string,
  error?: string,
): void {
  run(
    `UPDATE tasks SET state = ?, result = ?, error = ?, updated_at = CURRENT_TIMESTAMP
     WHERE tenant_id = ? AND task_id = ?`,
    [state, result ?? null, error ?? null, getTenantId(), taskId],
  );
}

export function logEvent(
  eventId: string,
  eventType: string,
  data: string,
  confidence: number,
): void {
  run(
    `INSERT INTO events (tenant_id, event_id, event_type, data, confidence)
     VALUES (?, ?, ?, ?, ?)`,
    [getTenantId(), eventId, eventType, data, confidence],
  );
}

export function lastEventId(): string | undefined {
  const row = get<{ event_id: string }>(
    "SELECT event_id FROM events WHERE tenant_id = ? ORDER BY timestamp DESC, rowid DESC LIMIT 1",
    [getTenantId()],
  );
  return row?.event_id;
}

export function getRecentEvents(limit = 10) {
  return all(
    "SELECT * FROM events WHERE tenant_id = ? ORDER BY timestamp DESC, rowid DESC LIMIT ?",
    [getTenantId(), limit],
  );
}

export function saveCheckpoint(data: string): void {
  run("INSERT INTO checkpoints (tenant_id, data, ts) VALUES (?, ?, ?)", [
    getTenantId(),
    data,
    Date.now(),
  ]);
  run(
    `DELETE FROM checkpoints WHERE id NOT IN
     (SELECT id FROM checkpoints WHERE tenant_id = ? ORDER BY ts DESC LIMIT 100)
     AND tenant_id = ?`,
    [getTenantId(), getTenantId()],
  );
}

export function getLastCheckpoint(): string | null {
  const row = get<{ data: string }>(
    "SELECT data FROM checkpoints WHERE tenant_id = ? ORDER BY ts DESC LIMIT 1",
    [getTenantId()],
  );
  return row?.data ?? null;
}

export function closeDb(): void {
  if (saveTimer) clearInterval(saveTimer);
  if (db) {
    persistToFile();
    db.close();
  }
  activeStore = null;
}
