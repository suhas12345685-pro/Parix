import initSqlJs, { type Database } from "sql.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

let db: Database;
let dbPath: string;
let saveTimer: ReturnType<typeof setInterval> | null = null;

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

  saveTimer = setInterval(() => persistToFile(), 30_000);

  return db;
}

export function persistToFile(): void {
  if (!db || !dbPath) return;
  const data = db.export();
  writeFileSync(dbPath, Buffer.from(data));
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
    `INSERT INTO tasks (task_id, type, state, payload)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(task_id) DO UPDATE SET
       state = excluded.state,
       updated_at = CURRENT_TIMESTAMP`,
    [taskId, type, state, payload ?? null],
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
     WHERE task_id = ?`,
    [state, result ?? null, error ?? null, taskId],
  );
}

export function logEvent(
  eventId: string,
  eventType: string,
  data: string,
  confidence: number,
): void {
  run(
    `INSERT INTO events (event_id, event_type, data, confidence)
     VALUES (?, ?, ?, ?)`,
    [eventId, eventType, data, confidence],
  );
}

export function lastEventId(): string | undefined {
  const row = get<{ event_id: string }>(
    "SELECT event_id FROM events ORDER BY timestamp DESC, rowid DESC LIMIT 1",
  );
  return row?.event_id;
}

export function getRecentEvents(limit = 10) {
  return all(
    "SELECT * FROM events ORDER BY timestamp DESC, rowid DESC LIMIT ?",
    [limit],
  );
}

export function saveCheckpoint(data: string): void {
  run("INSERT INTO checkpoints (data, ts) VALUES (?, ?)", [data, Date.now()]);
  run(
    `DELETE FROM checkpoints WHERE id NOT IN
     (SELECT id FROM checkpoints ORDER BY ts DESC LIMIT 100)`,
  );
}

export function getLastCheckpoint(): string | null {
  const row = get<{ data: string }>(
    "SELECT data FROM checkpoints ORDER BY ts DESC LIMIT 1",
  );
  return row?.data ?? null;
}

export function closeDb(): void {
  if (saveTimer) clearInterval(saveTimer);
  if (db) {
    persistToFile();
    db.close();
  }
}
