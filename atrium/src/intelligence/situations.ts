/**
 * Context Fusion — v0.2
 *
 * Fuses multiple concurrent signals (sensor events, user state, system state)
 * into a coherent "situation" that the engine can reason about holistically.
 *
 * Instead of reacting to each event independently, situations let the engine
 * see the bigger picture: "disk is low AND CPU is high AND user is idle"
 * is a different situation than just "disk is low".
 *
 * Table used: situations (from schema.sql)
 */

import { v4 as uuid } from "uuid";
import { getDb } from "../memory/db.js";

export interface Situation {
  id: string;
  ts: number;
  signals: Signal[];
  inferred: string;
  confidence: number;
  userState: string;
  actedOn: boolean;
}

export interface Signal {
  type: string;
  data: Record<string, unknown>;
  confidence: number;
  ts: number;
}

// ── Signal buffer ───────────────────────────────────────────────────

const SIGNAL_WINDOW_MS = 2 * 60 * 1000; // 2 min sliding window
const signalBuffer: Signal[] = [];

/**
 * Ingest a signal into the fusion buffer.
 */
export function addSignal(
  type: string,
  data: Record<string, unknown>,
  confidence: number,
): void {
  signalBuffer.push({
    type,
    data,
    confidence,
    ts: Date.now(),
  });

  // Prune signals older than the window
  const cutoff = Date.now() - SIGNAL_WINDOW_MS;
  while (signalBuffer.length > 0 && signalBuffer[0].ts < cutoff) {
    signalBuffer.shift();
  }
}

/**
 * Fuse current signals into a situation assessment.
 * Returns null if no actionable situation is detected.
 */
export function assess(): Situation | null {
  if (signalBuffer.length < 2) return null; // need multiple signals to fuse

  const signals = [...signalBuffer];
  const signalTypes = new Set(signals.map((s) => s.type));

  // ── Pattern matching: known multi-signal situations ────────────

  // System overload: high CPU + high memory
  if (signalTypes.has("cpu_high") && signalTypes.has("memory_high")) {
    return createSituation(
      signals,
      "system_overload",
      "System under heavy load — CPU and memory both elevated",
      0.9,
      "stressed",
    );
  }

  // Dying system: low battery + low disk + idle
  if (signalTypes.has("battery_low") && signalTypes.has("disk_low")) {
    return createSituation(
      signals,
      "system_dying",
      "System running low on both battery and disk space",
      0.85,
      "critical",
    );
  }

  // Network trouble + app crash
  if (signalTypes.has("wifi_disconnected") && signalTypes.has("app_crash")) {
    return createSituation(
      signals,
      "connectivity_cascade",
      "Network loss may be causing application failures",
      0.8,
      "degraded",
    );
  }

  // Active work session: terminal errors + high CPU (developer debugging)
  if (signalTypes.has("terminal_error") && signalTypes.has("cpu_high")) {
    return createSituation(
      signals,
      "debug_session",
      "Developer appears to be debugging — build/test errors with high CPU",
      0.7,
      "working",
    );
  }

  // Storage migration: USB connected + disk low
  if (
    (signalTypes.has("usb_storage_connected") ||
      signalTypes.has("usb_device_connected")) &&
    signalTypes.has("disk_low")
  ) {
    return createSituation(
      signals,
      "storage_migration",
      "External storage connected while disk is low — user may be migrating data",
      0.75,
      "migrating",
    );
  }

  // Idle system with issues: multiple warnings + idle
  const warningTypes = ["disk_low", "memory_high", "swap_high", "battery_low"];
  const activeWarnings = warningTypes.filter((t) => signalTypes.has(t));
  if (activeWarnings.length >= 2) {
    return createSituation(
      signals,
      "degraded_idle",
      `Multiple system warnings active: ${activeWarnings.join(", ")}`,
      0.8,
      "idle_degraded",
    );
  }

  return null;
}

/**
 * Get the current signal buffer contents (for Aegis dashboard).
 */
export function getCurrentSignals(): Signal[] {
  const cutoff = Date.now() - SIGNAL_WINDOW_MS;
  return signalBuffer.filter((s) => s.ts >= cutoff);
}

/**
 * Get recent situations from the database.
 */
export function getRecentSituations(limit = 10): Situation[] {
  const situations: Situation[] = [];
  try {
    const stmt = getDb().prepare(
      "SELECT * FROM situations ORDER BY ts DESC LIMIT ?",
    );
    stmt.bind([limit]);
    while (stmt.step()) {
      const cols = stmt.getColumnNames();
      const vals = stmt.get();
      const row: Record<string, unknown> = {};
      cols.forEach((c: string, i: number) => (row[c] = vals[i]));

      situations.push({
        id: String(row.id),
        ts: Number(row.ts),
        signals: safeParse(String(row.signals ?? "[]")) ?? [],
        inferred: String(row.inferred ?? ""),
        confidence: Number(row.confidence ?? 0),
        userState: String(row.user_state ?? ""),
        actedOn: Boolean(row.acted_on),
      });
    }
    stmt.free();
  } catch {
    // ignore
  }
  return situations;
}

/**
 * Mark a situation as acted upon.
 */
export function markActedOn(situationId: string): void {
  try {
    getDb().run("UPDATE situations SET acted_on = 1 WHERE id = ?", [
      situationId,
    ]);
  } catch {
    // ignore
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function createSituation(
  signals: Signal[],
  inferred: string,
  description: string,
  confidence: number,
  userState: string,
): Situation {
  const id = uuid();
  const ts = Date.now();

  const situation: Situation = {
    id,
    ts,
    signals,
    inferred,
    confidence,
    userState,
    actedOn: false,
  };

  // Persist
  try {
    getDb().run(
      `INSERT INTO situations (id, ts, signals, inferred, confidence, user_state, acted_on)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [
        id,
        ts,
        JSON.stringify(
          signals.map((s) => ({ type: s.type, confidence: s.confidence })),
        ),
        `${inferred}: ${description}`,
        confidence,
        userState,
      ],
    );
  } catch (err) {
    console.error("[SITUATIONS] Failed to persist:", err);
  }

  console.log(
    `[SITUATIONS] Detected: ${inferred} (confidence=${confidence.toFixed(2)}, state=${userState})`,
  );

  return situation;
}

function safeParse(str: string): any {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}
