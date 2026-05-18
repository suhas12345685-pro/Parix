/**
 * Surprise Tracking — v0.2
 *
 * Tracks events that deviate from expected patterns. Surprises are
 * things the engine didn't predict or that break established sequences.
 * Over time, this builds a model of "normal" vs "abnormal" system behavior.
 *
 * A surprise could be:
 *   - An event type never seen before
 *   - A familiar event at an unusual time
 *   - An action that failed when it usually succeeds
 *   - A sequence break (A→B→C usually, but got A→B→D)
 *
 * Table used: surprises, event_sequences (from schema.sql)
 */

import { getDb } from "../memory/db.js";

export interface Surprise {
  id: number;
  type: string;
  payload: Record<string, unknown>;
  ts: number;
  userAction: string | null;
  actionedAt: number | null;
}

// ── Sequence learning ───────────────────────────────────────────────

const SEQUENCE_WINDOW = 3; // look at last 3 events for patterns
const eventHistory: string[] = [];

/**
 * Record an event and check for surprises.
 * Returns a surprise if the event is unexpected, null otherwise.
 */
export function observeEvent(eventType: string): Surprise | null {
  eventHistory.push(eventType);

  // Keep history manageable
  if (eventHistory.length > 1000) {
    eventHistory.splice(0, 500);
  }

  let surprise: Surprise | null = null;

  // Check 1: Never-seen event type
  if (isNovelEventType(eventType)) {
    surprise = recordSurprise("novel_event", {
      event_type: eventType,
      reason: "First occurrence of this event type",
    });
  }

  // Check 2: Sequence break
  if (eventHistory.length >= SEQUENCE_WINDOW) {
    const sequence = eventHistory.slice(-SEQUENCE_WINDOW - 1, -1).join("→");
    const expected = predictNext(sequence);

    if (expected && expected !== eventType) {
      surprise = recordSurprise("sequence_break", {
        sequence,
        expected,
        actual: eventType,
        reason: `Expected "${expected}" after "${sequence}", got "${eventType}"`,
      });
    }

    // Learn the sequence regardless
    learnSequence(sequence, eventType);
  }

  return surprise;
}

/**
 * Record that an action had an unexpected outcome.
 */
export function observeOutcome(
  taskType: string,
  expected: "success" | "failure",
  actual: "success" | "failure",
): Surprise | null {
  if (expected === actual) return null;

  return recordSurprise("unexpected_outcome", {
    task_type: taskType,
    expected,
    actual,
    reason: `${taskType} was expected to ${expected} but ${actual === "success" ? "succeeded" : "failed"}`,
  });
}

/**
 * Mark a surprise as acknowledged/actioned by the user.
 */
export function acknowledgeSurprise(
  id: number,
  action: string = "acknowledged",
): void {
  try {
    getDb().run(
      "UPDATE surprises SET user_action = ?, actioned_at = ? WHERE id = ?",
      [action, Date.now(), id],
    );
  } catch {
    // ignore
  }
}

// ── Queries ─────────────────────────────────────────────────────────

/**
 * Get recent surprises.
 */
export function getRecentSurprises(limit = 20): Surprise[] {
  const results: Surprise[] = [];
  try {
    const stmt = getDb().prepare(
      "SELECT * FROM surprises ORDER BY ts DESC LIMIT ?",
    );
    stmt.bind([limit]);
    while (stmt.step()) {
      const cols = stmt.getColumnNames();
      const vals = stmt.get();
      const row: Record<string, unknown> = {};
      cols.forEach((c: string, i: number) => (row[c] = vals[i]));

      results.push({
        id: Number(row.id),
        type: String(row.type ?? ""),
        payload: safeParse(String(row.payload ?? "{}")) ?? {},
        ts: Number(row.ts ?? 0),
        userAction: row.user_action ? String(row.user_action) : null,
        actionedAt: row.actioned_at ? Number(row.actioned_at) : null,
      });
    }
    stmt.free();
  } catch {
    // ignore
  }
  return results;
}

/**
 * Get unactioned surprises (things the user hasn't seen yet).
 */
export function getUnactionedSurprises(): Surprise[] {
  const results: Surprise[] = [];
  try {
    const stmt = getDb().prepare(
      "SELECT * FROM surprises WHERE user_action IS NULL ORDER BY ts DESC LIMIT 50",
    );
    while (stmt.step()) {
      const cols = stmt.getColumnNames();
      const vals = stmt.get();
      const row: Record<string, unknown> = {};
      cols.forEach((c: string, i: number) => (row[c] = vals[i]));

      results.push({
        id: Number(row.id),
        type: String(row.type ?? ""),
        payload: safeParse(String(row.payload ?? "{}")) ?? {},
        ts: Number(row.ts ?? 0),
        userAction: null,
        actionedAt: null,
      });
    }
    stmt.free();
  } catch {
    // ignore
  }
  return results;
}

export function getSurpriseStats(): {
  total: number;
  unactioned: number;
  novelTypes: number;
  sequenceBreaks: number;
} {
  try {
    const total = queryCount("SELECT COUNT(*) FROM surprises");
    const unactioned = queryCount(
      "SELECT COUNT(*) FROM surprises WHERE user_action IS NULL",
    );
    const novelTypes = queryCount(
      "SELECT COUNT(*) FROM surprises WHERE type = 'novel_event'",
    );
    const sequenceBreaks = queryCount(
      "SELECT COUNT(*) FROM surprises WHERE type = 'sequence_break'",
    );
    return { total, unactioned, novelTypes, sequenceBreaks };
  } catch {
    return { total: 0, unactioned: 0, novelTypes: 0, sequenceBreaks: 0 };
  }
}

// ── Internal ────────────────────────────────────────────────────────

function isNovelEventType(eventType: string): boolean {
  try {
    const stmt = getDb().prepare(
      "SELECT COUNT(*) FROM events WHERE event_type = ? LIMIT 1",
    );
    stmt.bind([eventType]);
    if (stmt.step()) {
      const count = Number(stmt.get()[0]);
      stmt.free();
      return count <= 1; // only the current event
    }
    stmt.free();
  } catch {
    // ignore
  }
  return false;
}

function predictNext(sequence: string): string | null {
  try {
    // Find the most common next event for this sequence
    const stmt = getDb().prepare(
      `SELECT next_event, COUNT(*) as cnt
       FROM event_sequences
       WHERE sequence = ?
       GROUP BY next_event
       ORDER BY cnt DESC
       LIMIT 1`,
    );
    stmt.bind([sequence]);
    if (stmt.step()) {
      const nextEvent = String(stmt.get()[0]);
      stmt.free();
      return nextEvent;
    }
    stmt.free();
  } catch {
    // table may not exist or be empty
  }
  return null;
}

function learnSequence(sequence: string, nextEvent: string): void {
  try {
    getDb().run(
      "INSERT INTO event_sequences (sequence, next_event) VALUES (?, ?)",
      [sequence, nextEvent],
    );
  } catch {
    // ignore
  }
}

function recordSurprise(
  type: string,
  payload: Record<string, unknown>,
): Surprise {
  const ts = Date.now();

  try {
    getDb().run("INSERT INTO surprises (type, payload, ts) VALUES (?, ?, ?)", [
      type,
      JSON.stringify(payload),
      ts,
    ]);
  } catch (err) {
    console.error("[SURPRISES] Failed to record:", err);
  }

  console.log(
    `[SURPRISES] ${type}: ${payload.reason ?? JSON.stringify(payload)}`,
  );

  return {
    id: 0, // assigned by DB
    type,
    payload,
    ts,
    userAction: null,
    actionedAt: null,
  };
}

function queryCount(sql: string): number {
  const stmt = getDb().prepare(sql);
  if (stmt.step()) {
    const val = Number(stmt.get()[0]);
    stmt.free();
    return val;
  }
  stmt.free();
  return 0;
}

function safeParse(str: string): any {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}
