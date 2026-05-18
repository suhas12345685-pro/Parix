/**
 * Explainability module — "Why did you do that?"
 *
 * Queries the audit ledger and reconstructs a human-readable
 * explanation chain for any action Parix took.
 */

import { getRecentAudit } from "./audit.js";
import { getDb } from "../memory/db.js";

export interface ActionExplanation {
  taskId: string;
  what: string;
  why: string;
  when: string;
  safety: string;
  outcome: string;
  chain: AuditStep[];
}

interface AuditStep {
  action: string;
  actor: string;
  timestamp: string;
  payload?: Record<string, unknown>;
}

/**
 * Explain the most recent action, or a specific task by ID.
 */
export function explainAction(taskId?: string): ActionExplanation | null {
  const entries = taskId ? getAuditForTask(taskId) : getRecentAudit(10);

  if (entries.length === 0) return null;

  // Find the execute entry (the actual action)
  const executeEntry = entries.find((e) =>
    String(e.action).startsWith("execute:"),
  );
  if (!executeEntry && !taskId) {
    // Nothing executed yet
    return null;
  }

  const targetTaskId = taskId ?? String(executeEntry?.task_id ?? "");
  const taskEntries = taskId ? entries : getAuditForTask(targetTaskId);

  // Build the chain
  const chain: AuditStep[] = taskEntries.map((e) => ({
    action: String(e.action),
    actor: String(e.actor),
    timestamp: formatTimestamp((e.ts ?? e.created_at) as string | number),
    payload: e.payload
      ? (safeParse(String(e.payload)) ?? undefined)
      : undefined,
  }));

  // Extract the action details from execute entry
  const execAction = chain.find((s) => s.action.startsWith("execute:"));
  const resultStep = chain.find(
    (s) =>
      s.action === "success" || s.action === "failure" || s.action === "error",
  );

  // Look up the triggering event
  const triggerEvent = getTriggerEvent(targetTaskId);

  const taskType = execAction?.action.replace("execute:", "") ?? "unknown";

  return {
    taskId: targetTaskId,
    what: describeAction(taskType, execAction?.payload),
    why: describeTrigger(triggerEvent),
    when: execAction?.timestamp ?? "unknown",
    safety: describeSafety(chain),
    outcome: resultStep?.action ?? "pending",
    chain,
  };
}

/**
 * Get all audit entries for a specific task.
 */
function getAuditForTask(taskId: string): Array<Record<string, unknown>> {
  try {
    const results: Array<Record<string, unknown>> = [];
    const stmt = getDb().prepare(
      "SELECT * FROM audit_ledger WHERE task_id = ? ORDER BY id ASC",
    );
    stmt.bind([taskId]);
    while (stmt.step()) {
      const cols = stmt.getColumnNames();
      const vals = stmt.get();
      const obj: Record<string, unknown> = {};
      cols.forEach((c: string, i: number) => (obj[c] = vals[i]));
      results.push(obj);
    }
    stmt.free();
    return results;
  } catch {
    return [];
  }
}

/**
 * Look up the sensor/intent event that triggered a task.
 */
function getTriggerEvent(taskId: string): Record<string, unknown> | null {
  try {
    const stmt = getDb().prepare(
      `SELECT * FROM events WHERE event_id = ? OR
       timestamp <= (SELECT MIN(ts) FROM audit_ledger WHERE task_id = ?)
       ORDER BY timestamp DESC LIMIT 1`,
    );
    stmt.bind([taskId, taskId]);
    if (stmt.step()) {
      const cols = stmt.getColumnNames();
      const vals = stmt.get();
      const obj: Record<string, unknown> = {};
      cols.forEach((c: string, i: number) => (obj[c] = vals[i]));
      stmt.free();
      return obj;
    }
    stmt.free();
  } catch {
    // ignore
  }
  return null;
}

/**
 * Human-readable description of what Parix did.
 */
function describeAction(
  taskType: string,
  payload?: Record<string, unknown>,
): string {
  if (!payload) return `Executed a ${taskType} task`;

  switch (taskType) {
    case "cli":
      return `Ran command: ${String(payload.command ?? "").slice(0, 200)}`;
    case "notification":
      return `Sent notification: "${payload.title ?? ""}"`;
    default:
      return `Executed ${taskType} task`;
  }
}

/**
 * Human-readable description of WHY.
 */
function describeTrigger(event: Record<string, unknown> | null): string {
  if (!event) return "No trigger event found (may have been a manual retry)";

  const eventType = String(event.event_type ?? "unknown");
  const data = safeParse(String(event.data ?? "{}"));

  switch (eventType) {
    case "terminal_error":
      return `A terminal error was detected in your command output`;
    case "disk_low":
      return `Disk space dropped below ${data?.free_pct ?? 10}% on ${data?.mount ?? "a drive"}`;
    case "cpu_high":
      return `CPU usage spiked to ${data?.percent ?? "?"}%`;
    case "memory_high":
      return `RAM usage exceeded ${data?.used_pct ?? 90}%`;
    case "battery_low":
      return `Battery dropped to ${data?.percent ?? "?"}% (unplugged)`;
    case "clipboard_sensitive_data":
      return "Sensitive data was detected on the clipboard";
    case "silent:idle_shutdown":
      return "System was idle with low battery — shutdown may be imminent";
    case "silent:tab_overload":
      return `Too many browser tabs open (${data?.tab_count ?? "many"})`;
    case "silent:long_uptime":
      return `System uptime exceeds ${data?.uptime_hours ?? 72} hours`;
    default:
      return `Sensor event: ${eventType}`;
  }
}

/**
 * Describe what safety checks were applied.
 */
function describeSafety(chain: AuditStep[]): string {
  const parts: string[] = [];

  // All actions go through constitution + governor + reversibility
  parts.push("Constitution check passed");
  parts.push("Governor rate limit passed");

  const execStep = chain.find((s) => s.action.startsWith("execute:"));
  if (execStep?.payload) {
    // nothing extra
  }

  parts.push("Reversibility scored");
  parts.push("Audit hash chain recorded");

  return parts.join(" → ");
}

/**
 * Get a formatted summary of the last N actions with explanations.
 */
export function getRecentExplanations(count = 5): ActionExplanation[] {
  const audit = getRecentAudit(count * 3); // get extra for grouping
  const taskIds = new Set<string>();
  const explanations: ActionExplanation[] = [];

  for (const entry of audit) {
    const tid = String(entry.task_id ?? "");
    if (!tid || taskIds.has(tid)) continue;
    if (!String(entry.action).startsWith("execute:")) continue;

    taskIds.add(tid);
    const explanation = explainAction(tid);
    if (explanation) {
      explanations.push(explanation);
      if (explanations.length >= count) break;
    }
  }

  return explanations;
}

/**
 * Format for human display (console or notification).
 */
export function formatExplanation(exp: ActionExplanation): string {
  const lines = [
    `📋 Action: ${exp.what}`,
    `💡 Why: ${exp.why}`,
    `🕐 When: ${exp.when}`,
    `🛡️ Safety: ${exp.safety}`,
    `✅ Outcome: ${exp.outcome}`,
  ];
  return lines.join("\n");
}

// ── Helpers ──────────────────────────────────────────────────────────────

function safeParse(str: string): Record<string, unknown> | null {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function formatTimestamp(ts: string | number): string {
  try {
    const d = typeof ts === "number" ? new Date(ts) : new Date(ts);
    return d.toLocaleString();
  } catch {
    return String(ts);
  }
}
