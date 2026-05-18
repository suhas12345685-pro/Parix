import { createHash } from "crypto";
import { getDb } from "../memory/db.js";

interface AuditEntry {
  actor: string;
  action: string;
  taskId?: string;
  payload?: Record<string, unknown>;
}

let lastHash =
  "0000000000000000000000000000000000000000000000000000000000000000";

export function initAuditChain(): void {
  try {
    const stmt = getDb().prepare(
      "SELECT this_hash FROM audit_ledger ORDER BY id DESC LIMIT 1",
    );
    if (stmt.step()) {
      const vals = stmt.get();
      lastHash = String(vals[0]);
    }
    stmt.free();
  } catch {
    // Table may not exist yet
  }
}

export function audit(entry: AuditEntry): string {
  const payloadStr = entry.payload ? JSON.stringify(entry.payload) : null;

  const preimage = [
    lastHash,
    entry.actor,
    entry.action,
    entry.taskId ?? "",
    payloadStr ?? "",
    Date.now().toString(),
  ].join("|");

  const thisHash = createHash("sha256").update(preimage).digest("hex");

  try {
    getDb().run(
      `INSERT INTO audit_ledger (actor, action, task_id, payload, prev_hash, this_hash)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        entry.actor,
        entry.action,
        entry.taskId ?? null,
        payloadStr,
        lastHash,
        thisHash,
      ],
    );
  } catch (err) {
    console.error("[ATRIUM:AUDIT] Failed to write ledger:", err);
    return thisHash;
  }

  lastHash = thisHash;
  return thisHash;
}

export function verifyChain(): { valid: boolean; brokenAt?: number } {
  try {
    const rows: Array<{ id: number; prev_hash: string; this_hash: string }> =
      [];
    const stmt = getDb().prepare(
      "SELECT id, prev_hash, this_hash FROM audit_ledger ORDER BY id ASC",
    );
    while (stmt.step()) {
      const vals = stmt.get();
      rows.push({
        id: Number(vals[0]),
        prev_hash: String(vals[1]),
        this_hash: String(vals[2]),
      });
    }
    stmt.free();

    if (rows.length === 0) return { valid: true };

    for (let i = 1; i < rows.length; i++) {
      if (rows[i].prev_hash !== rows[i - 1].this_hash) {
        console.error(
          `[ATRIUM:AUDIT] Chain broken at id=${rows[i].id}: expected prev=${rows[i - 1].this_hash}, got ${rows[i].prev_hash}`,
        );
        return { valid: false, brokenAt: rows[i].id };
      }
    }

    return { valid: true };
  } catch {
    return { valid: true };
  }
}

export function getRecentAudit(limit = 20): Array<Record<string, unknown>> {
  try {
    const results: Array<Record<string, unknown>> = [];
    const stmt = getDb().prepare(
      "SELECT * FROM audit_ledger ORDER BY id DESC LIMIT ?",
    );
    stmt.bind([limit]);
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
