/**
 * Episodic Memory — v0.2
 *
 * Records episodes (sequences of related events + actions) and provides
 * recall for pattern recognition. Episodes help the engine learn from
 * past situations: "Last time disk was low + CPU was high, clearing
 * temp files fixed it."
 *
 * Tables used: episodes, recall_log (from schema.sql)
 */

import { getDb, persistToFile } from "../memory/db.js";

export interface Episode {
  id: number;
  summary: string;
  startTs: number;
  endTs: number | null;
  taskIds: string[];
  keyEntities: string[];
  outcome: string;
  createdAt: string;
}

interface ActiveEpisode {
  startTs: number;
  taskIds: string[];
  eventTypes: string[];
  keyEntities: Set<string>;
  actions: string[];
}

// ── Episode lifecycle ───────────────────────────────────────────────

let currentEpisode: ActiveEpisode | null = null;
const EPISODE_TIMEOUT_MS = 5 * 60 * 1000; // 5 min of inactivity ends an episode
let lastActivity = 0;

/**
 * Begin or continue an episode. Call this every time the engine
 * processes an event or takes an action.
 */
export function recordActivity(
  eventType: string,
  taskId: string | null,
  action: string | null,
  entities: string[] = [],
): void {
  const now = Date.now();

  // If gap > timeout, close the old episode and start fresh
  if (currentEpisode && now - lastActivity > EPISODE_TIMEOUT_MS) {
    closeEpisode("timeout");
  }

  if (!currentEpisode) {
    currentEpisode = {
      startTs: now,
      taskIds: [],
      eventTypes: [],
      keyEntities: new Set(),
      actions: [],
    };
  }

  currentEpisode.eventTypes.push(eventType);
  if (taskId) currentEpisode.taskIds.push(taskId);
  if (action) currentEpisode.actions.push(action);
  for (const e of entities) currentEpisode.keyEntities.add(e);

  lastActivity = now;
}

/**
 * Close the current episode with an outcome.
 */
export function closeEpisode(outcome: string = "completed"): Episode | null {
  if (!currentEpisode) return null;

  const summary = buildSummary(currentEpisode);
  const now = Date.now();

  try {
    getDb().run(
      `INSERT INTO episodes (summary, start_ts, end_ts, task_ids, key_entities, outcome)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        summary,
        new Date(currentEpisode.startTs).toISOString(),
        new Date(now).toISOString(),
        JSON.stringify(currentEpisode.taskIds),
        JSON.stringify([...currentEpisode.keyEntities]),
        outcome,
      ],
    );
    persistToFile();
  } catch (err) {
    console.error("[EPISODES] Failed to save:", err);
  }

  const episode: Episode = {
    id: 0,
    summary,
    startTs: currentEpisode.startTs,
    endTs: now,
    taskIds: currentEpisode.taskIds,
    keyEntities: [...currentEpisode.keyEntities],
    outcome,
    createdAt: new Date().toISOString(),
  };

  currentEpisode = null;
  return episode;
}

// ── Recall ──────────────────────────────────────────────────────────

/**
 * Recall similar past episodes based on event types and entities.
 * Returns the most relevant episodes for context-aware planning.
 */
export function recall(
  eventTypes: string[],
  entities: string[] = [],
  limit = 5,
): Episode[] {
  const episodes: Episode[] = [];

  try {
    // Search by matching event types in the summary or key_entities
    const searchTerms = [...eventTypes, ...entities];
    if (searchTerms.length === 0) return episodes;

    // Build a LIKE query for each term
    const conditions = searchTerms.map(
      () => `(summary LIKE ? OR key_entities LIKE ?)`,
    );
    const params: string[] = [];
    for (const term of searchTerms) {
      params.push(`%${term}%`, `%${term}%`);
    }

    const sql = `
      SELECT * FROM episodes
      WHERE ${conditions.join(" OR ")}
      ORDER BY end_ts DESC
      LIMIT ?
    `;
    params.push(String(limit));

    const stmt = getDb().prepare(sql);
    stmt.bind(params);
    while (stmt.step()) {
      const cols = stmt.getColumnNames();
      const vals = stmt.get();
      const row: Record<string, unknown> = {};
      cols.forEach((c: string, i: number) => (row[c] = vals[i]));

      episodes.push({
        id: Number(row.id),
        summary: String(row.summary ?? ""),
        startTs: new Date(String(row.start_ts)).getTime(),
        endTs: row.end_ts ? new Date(String(row.end_ts)).getTime() : null,
        taskIds: safeParse(String(row.task_ids ?? "[]")) ?? [],
        keyEntities: safeParse(String(row.key_entities ?? "[]")) ?? [],
        outcome: String(row.outcome ?? ""),
        createdAt: String(row.created_at ?? ""),
      });
    }
    stmt.free();

    // Log recall for analytics
    for (const ep of episodes) {
      logRecall(ep.id);
    }
  } catch {
    // episodes table may be empty
  }

  return episodes;
}

/**
 * Get recent episodes.
 */
export function getRecentEpisodes(limit = 10): Episode[] {
  const episodes: Episode[] = [];
  try {
    const stmt = getDb().prepare(
      "SELECT * FROM episodes ORDER BY id DESC LIMIT ?",
    );
    stmt.bind([limit]);
    while (stmt.step()) {
      const cols = stmt.getColumnNames();
      const vals = stmt.get();
      const row: Record<string, unknown> = {};
      cols.forEach((c: string, i: number) => (row[c] = vals[i]));

      episodes.push({
        id: Number(row.id),
        summary: String(row.summary ?? ""),
        startTs: row.start_ts ? new Date(String(row.start_ts)).getTime() : 0,
        endTs: row.end_ts ? new Date(String(row.end_ts)).getTime() : null,
        taskIds: safeParse(String(row.task_ids ?? "[]")) ?? [],
        keyEntities: safeParse(String(row.key_entities ?? "[]")) ?? [],
        outcome: String(row.outcome ?? ""),
        createdAt: String(row.created_at ?? ""),
      });
    }
    stmt.free();
  } catch {
    // ignore
  }
  return episodes;
}

export function getEpisodeStats(): {
  total: number;
  avgDuration: number;
  recallCount: number;
} {
  try {
    const countStmt = getDb().prepare("SELECT COUNT(*) FROM episodes");
    countStmt.step();
    const total = Number(countStmt.get()[0]);
    countStmt.free();

    const recallStmt = getDb().prepare("SELECT COUNT(*) FROM recall_log");
    recallStmt.step();
    const recallCount = Number(recallStmt.get()[0]);
    recallStmt.free();

    return { total, avgDuration: 0, recallCount };
  } catch {
    return { total: 0, avgDuration: 0, recallCount: 0 };
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function buildSummary(ep: ActiveEpisode): string {
  const uniqueEvents = [...new Set(ep.eventTypes)];
  const actions = ep.actions.slice(0, 5);
  const parts: string[] = [];

  parts.push(`Events: ${uniqueEvents.join(", ")}`);
  if (actions.length > 0) parts.push(`Actions: ${actions.join(", ")}`);
  if (ep.keyEntities.size > 0)
    parts.push(`Entities: ${[...ep.keyEntities].join(", ")}`);
  parts.push(`Tasks: ${ep.taskIds.length}`);

  return parts.join(" | ");
}

function logRecall(episodeId: number): void {
  try {
    getDb().run("INSERT INTO recall_log (episode_id, ts) VALUES (?, ?)", [
      episodeId,
      Date.now(),
    ]);
    persistToFile();
  } catch {
    // ignore
  }
}

function safeParse(str: string): any {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}
