import { createHash } from "crypto";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import type { CognitiveEvent } from "../types.js";
import { getDb, persistToFile } from "../../memory/db.js";
import { dispatch } from "../../intelligence/notify.js";
import { shouldActProactively } from "../../intelligence/generosity.js";
import { recordPulseMemory } from "./memory.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../../..");
const HIGH_SIGNAL_THRESHOLD = 0.86;
const NOTIFICATION_COOLDOWN_MS = 60 * 60 * 1000;

export interface ErrorShadowDraft {
  id: string;
  eventHash: string;
  cwd: string | null;
  errorExcerpt: string;
  draftPath: string;
  suggestedFix: string;
  confidence: number;
  notificationScore: number;
  notificationChannel: "silent" | "notify";
  repeatCount: number;
  createdAt: number;
  lastSeenAt: number;
}

export function maybeCreateErrorShadow(
  event: CognitiveEvent,
): ErrorShadowDraft | null {
  if (event.type !== "terminal_error") return null;

  const errorExcerpt = extractErrorText(event.data);
  if (!errorExcerpt) return null;

  const cwd = typeof event.data.cwd === "string" ? event.data.cwd : null;
  const eventHash = hashError(errorExcerpt, cwd);
  const now = Date.now();
  const existing = getExistingDraft(eventHash);
  const repeatCount = (existing?.repeatCount ?? 0) + 1;
  const suggestedFix = suggestFix(errorExcerpt);
  const notificationScore = scoreErrorShadowNotification({
    confidence: event.confidence,
    errorExcerpt,
    repeatCount,
    cwd,
  });
  const shouldNotify = shouldNotifyForErrorShadow(
    eventHash,
    notificationScore,
    errorExcerpt,
  );
  const draftPath =
    existing?.draftPath ?? buildDraftPath(eventHash, now, errorExcerpt);
  const createdAt = existing?.createdAt ?? now;

  const draft: ErrorShadowDraft = {
    id: existing?.id ?? `error_shadow_${eventHash}`,
    eventHash,
    cwd,
    errorExcerpt,
    draftPath,
    suggestedFix,
    confidence: event.confidence,
    notificationScore,
    notificationChannel: shouldNotify ? "notify" : "silent",
    repeatCount,
    createdAt,
    lastSeenAt: now,
  };

  writeDraftFile(draft);
  persistDraft(draft);
  recordPulseMemory(
    "last_error_shadow",
    {
      eventHash,
      draftPath,
      notificationChannel: draft.notificationChannel,
      notificationScore,
      repeatCount,
      lastSeenAt: now,
    },
    Math.max(event.confidence, notificationScore),
  );

  if (shouldNotify) {
    notifyErrorShadow(draft);
  }

  return draft;
}

export function scoreErrorShadowNotification(input: {
  confidence: number;
  errorExcerpt: string;
  repeatCount: number;
  cwd: string | null;
}): number {
  const severity = severityScore(input.errorExcerpt);
  const repeatBoost = Math.min(0.18, Math.max(0, input.repeatCount - 1) * 0.09);
  const contextBoost = input.cwd ? 0.04 : 0;
  return clamp(
    input.confidence * 0.55 + severity * 0.28 + repeatBoost + contextBoost,
  );
}

export function getLastErrorShadow(): ErrorShadowDraft | null {
  const stmt = getDb().prepare(
    `SELECT id, event_hash, cwd, error_excerpt, draft_path, suggested_fix,
            confidence, notification_score, notification_channel,
            repeat_count, created_at, last_seen_at
     FROM error_shadow_drafts
     ORDER BY last_seen_at DESC
     LIMIT 1`,
  );

  try {
    if (!stmt.step()) return null;
    return rowToDraft(stmt.get());
  } finally {
    stmt.free();
  }
}

function shouldNotifyForErrorShadow(
  eventHash: string,
  notificationScore: number,
  errorExcerpt: string,
): boolean {
  const severeOverride =
    severityScore(errorExcerpt) >= 0.95 && notificationScore >= 0.82;
  if (!severeOverride && notificationScore < HIGH_SIGNAL_THRESHOLD) {
    return false;
  }
  if (!shouldActProactively(notificationScore)) return false;
  return !recentlyNotified(eventHash);
}

function notifyErrorShadow(draft: ErrorShadowDraft): void {
  const body = [
    `Suhas, I sensed repeated terminal stderr.`,
    `I've already drafted a fix in ${draft.draftPath}.`,
    `Likely next step: ${draft.suggestedFix}`,
  ].join(" ");

  void dispatch({
    title: "Error-Shadow Draft Ready",
    body,
    urgency: draft.notificationScore >= 0.92 ? "high" : "medium",
    actions: [{ label: "Open draft", value: draft.draftPath }],
  }).catch((err) => {
    console.error(
      "[PULSE:error-shadow] Notification failed:",
      err instanceof Error ? err.message : err,
    );
  });
}

function extractErrorText(data: Record<string, unknown>): string {
  const candidates = [data.stderr, data.error, data.output, data.message];
  const found = candidates.find(
    (value): value is string =>
      typeof value === "string" && value.trim() !== "",
  );
  return truncate(found?.trim() ?? "", 4000);
}

function suggestFix(errorExcerpt: string): string {
  const error = errorExcerpt.toLowerCase();
  const missingModule = /cannot find module ['"]([^'"]+)['"]/i.exec(
    errorExcerpt,
  );

  if (missingModule?.[1]) {
    const moduleName = missingModule[1];
    if (moduleName.startsWith(".") || moduleName.startsWith("/")) {
      return `Check that ${moduleName} exists and the import path is correct.`;
    }
    return `Install or restore the missing dependency: npm install ${moduleName}`;
  }

  if (error.includes("module_not_found")) {
    return "Run npm install, then verify the missing package or import path.";
  }
  if (error.includes("enospc") || error.includes("no space left")) {
    return "Free disk space first, then retry the command.";
  }
  if (error.includes("eacces") || error.includes("permission denied")) {
    return "Check file ownership/permissions; avoid sudo until the path is verified.";
  }
  if (error.includes("econnrefused")) {
    return "Verify the dependent local service is running and the port is correct.";
  }
  if (error.includes("traceback")) {
    return "Inspect the final traceback frame and rerun the failing command with the same environment.";
  }
  if (error.includes("npm err")) {
    return "Read the first npm ERR block, run npm install if dependencies are stale, then retry.";
  }
  return "Review the stderr excerpt, identify the first failing frame, and retry with a smaller reproducible command.";
}

function severityScore(errorExcerpt: string): number {
  const error = errorExcerpt.toLowerCase();
  if (
    error.includes("enospc") ||
    error.includes("data loss") ||
    error.includes("fatal")
  ) {
    return 1;
  }
  if (
    error.includes("traceback") ||
    error.includes("module_not_found") ||
    error.includes("cannot find module") ||
    error.includes("npm err") ||
    error.includes("failed")
  ) {
    return 0.75;
  }
  if (
    error.includes("error") ||
    error.includes("exception") ||
    error.includes("eacces")
  ) {
    return 0.6;
  }
  return 0.35;
}

function persistDraft(draft: ErrorShadowDraft): void {
  getDb().run(
    `INSERT INTO error_shadow_drafts (
       id, event_hash, cwd, error_excerpt, draft_path, suggested_fix,
       confidence, notification_score, notification_channel, repeat_count,
       created_at, last_seen_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       cwd = excluded.cwd,
       error_excerpt = excluded.error_excerpt,
       draft_path = excluded.draft_path,
       suggested_fix = excluded.suggested_fix,
       confidence = excluded.confidence,
       notification_score = excluded.notification_score,
       notification_channel = excluded.notification_channel,
       repeat_count = excluded.repeat_count,
       last_seen_at = excluded.last_seen_at`,
    [
      draft.id,
      draft.eventHash,
      draft.cwd,
      draft.errorExcerpt,
      draft.draftPath,
      draft.suggestedFix,
      draft.confidence,
      draft.notificationScore,
      draft.notificationChannel,
      draft.repeatCount,
      draft.createdAt,
      draft.lastSeenAt,
    ],
  );
  persistToFile();
}

function getExistingDraft(eventHash: string): ErrorShadowDraft | null {
  const stmt = getDb().prepare(
    `SELECT id, event_hash, cwd, error_excerpt, draft_path, suggested_fix,
            confidence, notification_score, notification_channel,
            repeat_count, created_at, last_seen_at
     FROM error_shadow_drafts
     WHERE event_hash = ?
     ORDER BY last_seen_at DESC
     LIMIT 1`,
  );
  stmt.bind([eventHash]);

  try {
    if (!stmt.step()) return null;
    return rowToDraft(stmt.get());
  } finally {
    stmt.free();
  }
}

function rowToDraft(row: unknown[]): ErrorShadowDraft {
  return {
    id: String(row[0]),
    eventHash: String(row[1]),
    cwd: row[2] === null || row[2] === undefined ? null : String(row[2]),
    errorExcerpt: String(row[3]),
    draftPath: String(row[4]),
    suggestedFix: String(row[5] ?? ""),
    confidence: Number(row[6]),
    notificationScore: Number(row[7]),
    notificationChannel: String(row[8]) === "notify" ? "notify" : "silent",
    repeatCount: Number(row[9]),
    createdAt: Number(row[10]),
    lastSeenAt: Number(row[11]),
  };
}

function recentlyNotified(eventHash: string): boolean {
  const stmt = getDb().prepare(
    `SELECT last_seen_at
     FROM error_shadow_drafts
     WHERE event_hash = ? AND notification_channel = 'notify'
     ORDER BY last_seen_at DESC
     LIMIT 1`,
  );
  stmt.bind([eventHash]);

  try {
    if (!stmt.step()) return false;
    const lastSeenAt = Number(stmt.get()[0]);
    return Date.now() - lastSeenAt < NOTIFICATION_COOLDOWN_MS;
  } finally {
    stmt.free();
  }
}

function writeDraftFile(draft: ErrorShadowDraft): void {
  mkdirSync(dirname(draft.draftPath), { recursive: true });
  const status = existsSync(draft.draftPath) ? "Updated" : "Created";

  writeFileSync(
    draft.draftPath,
    [
      "# Error-Shadow Draft",
      "",
      `Status: ${status}`,
      `Created: ${new Date(draft.createdAt).toISOString()}`,
      `Last seen: ${new Date(draft.lastSeenAt).toISOString()}`,
      `Repeat count: ${draft.repeatCount}`,
      `Confidence: ${draft.confidence.toFixed(2)}`,
      `Notification score: ${draft.notificationScore.toFixed(2)}`,
      `Notification mode: ${draft.notificationChannel}`,
      draft.cwd ? `Workspace: ${draft.cwd}` : "Workspace: unknown",
      "",
      "## Likely Fix",
      "",
      draft.suggestedFix,
      "",
      "## Why Parix Drafted This",
      "",
      "A terminal stderr event arrived before Suhas asked for help. This draft is intentionally kept in shadow_drafts until it is reviewed or promoted.",
      "",
      "## Stderr Excerpt",
      "",
      "```text",
      draft.errorExcerpt,
      "```",
      "",
      "## Safe Next Steps",
      "",
      "1. Confirm this stderr belongs to the active task.",
      "2. Run the smallest reversible diagnostic command.",
      "3. Promote the fix only after it succeeds locally.",
    ].join("\n"),
    "utf-8",
  );
}

function buildDraftPath(
  eventHash: string,
  createdAt: number,
  errorExcerpt: string,
): string {
  const root =
    process.env.PARIX_SHADOW_DRAFTS_DIR ?? join(REPO_ROOT, "shadow_drafts");
  const stamp = new Date(createdAt).toISOString().replace(/[:.]/g, "-");
  const slug = slugify(errorExcerpt).slice(0, 48) || "terminal-error";
  return join(
    root,
    "technical",
    "error-shadow",
    `${stamp}-${slug}-${eventHash.slice(0, 8)}.md`,
  );
}

function hashError(errorExcerpt: string, cwd: string | null): string {
  const normalized = errorExcerpt
    .replace(/\d{2,}/g, "<num>")
    .replace(/[A-Z]:\\[^\s]+/gi, "<path>")
    .replace(/\/[^\s]+/g, "<path>")
    .trim()
    .toLowerCase();
  return createHash("sha256")
    .update(`${cwd ?? "unknown"}\n${normalized}`)
    .digest("hex");
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : value.slice(value.length - max);
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}
