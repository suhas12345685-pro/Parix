import { getDb, persistToFile } from "../../memory/db.js";

export interface PulseMemoryEntry<T = unknown> {
  key: string;
  value: T;
  confidence: number;
  updatedAt: number;
}

export function recordPulseMemory<T>(
  key: string,
  value: T,
  confidence = 0.7,
): PulseMemoryEntry<T> {
  const updatedAt = Date.now();
  const entry: PulseMemoryEntry<T> = {
    key,
    value,
    confidence,
    updatedAt,
  };

  getDb().run(
    `INSERT INTO pulse_memory (key, value_json, confidence, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value_json = excluded.value_json,
       confidence = excluded.confidence,
       updated_at = excluded.updated_at`,
    [key, JSON.stringify(value), confidence, updatedAt],
  );
  persistToFile();

  return entry;
}

export function getPulseMemory<T = unknown>(
  key: string,
): PulseMemoryEntry<T> | null {
  const stmt = getDb().prepare(
    "SELECT key, value_json, confidence, updated_at FROM pulse_memory WHERE key = ?",
  );
  stmt.bind([key]);

  try {
    if (!stmt.step()) return null;
    const row = stmt.get();
    return {
      key: String(row[0]),
      value: safeParse<T>(String(row[1])),
      confidence: Number(row[2]),
      updatedAt: Number(row[3]),
    };
  } finally {
    stmt.free();
  }
}

export function listPulseMemory(limit = 20): PulseMemoryEntry[] {
  const stmt = getDb().prepare(
    `SELECT key, value_json, confidence, updated_at
     FROM pulse_memory
     ORDER BY updated_at DESC
     LIMIT ?`,
  );
  stmt.bind([limit]);

  const entries: PulseMemoryEntry[] = [];
  try {
    while (stmt.step()) {
      const row = stmt.get();
      entries.push({
        key: String(row[0]),
        value: safeParse(String(row[1])),
        confidence: Number(row[2]),
        updatedAt: Number(row[3]),
      });
    }
  } finally {
    stmt.free();
  }
  return entries;
}

function safeParse<T>(value: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return value as T;
  }
}
