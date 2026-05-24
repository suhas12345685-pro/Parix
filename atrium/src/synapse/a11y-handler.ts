/**
 * Receiver for ACCESSIBILITY_SNAPSHOT messages from Hands.
 *
 * Stores compact summaries in `accessibility_snapshots`, keeps the latest
 * snapshot in module state for fast in-process lookup, and emits an event
 * other subsystems (cognition, relay) can subscribe to.
 */

import { EventEmitter } from "events";
import { getDb, persistToFile } from "../memory/db.js";
import { maybeRequestVisualFallback } from "./multimodal-handler.js";

export interface FocusedElementSummary {
  role: string;
  name: string;
  value?: string | null;
  state: string[];
  bounds?: number[] | null;
  source?: string;
  childCount?: number;
  children?: FocusedElementSummary[];
}

export interface AccessibilitySnapshotMessage {
  type: "ACCESSIBILITY_SNAPSHOT";
  snapshot_id: string;
  focused_app: string;
  backend_used: string;
  tree_summary: {
    ts?: number;
    platform?: string;
    backend_used?: string;
    focused_app?: string;
    focused_element?: FocusedElementSummary | null;
    confidence?: number;
    had_raw_text?: boolean;
  };
  confidence: number;
  timestamp: number;
}

export interface LatestAccessibility {
  snapshotId: string;
  focusedApp: string;
  backendUsed: string;
  focusedElement: FocusedElementSummary | null;
  confidence: number;
  ts: number;
  receivedAt: number;
}

const emitter = new EventEmitter();
let latest: LatestAccessibility | null = null;

/**
 * Persist + update in-process state. Idempotent: re-handling the same
 * snapshot_id is harmless (the table grows by one row, but `latest` is
 * already correct).
 */
export function handleA11ySnapshot(msg: AccessibilitySnapshotMessage): void {
  const focusedEl = msg.tree_summary?.focused_element ?? null;
  const next: LatestAccessibility = {
    snapshotId: msg.snapshot_id,
    focusedApp: msg.focused_app || "",
    backendUsed: msg.backend_used || "",
    focusedElement: focusedEl,
    confidence: typeof msg.confidence === "number" ? msg.confidence : 0,
    ts: typeof msg.timestamp === "number" ? msg.timestamp : Date.now() / 1000,
    receivedAt: Date.now(),
  };
  latest = next;
  const fallback = maybeRequestVisualFallback({
    snapshotId: next.snapshotId,
    focusedApp: next.focusedApp,
    backendUsed: next.backendUsed,
    confidence: next.confidence,
    treeSummary: msg.tree_summary ?? {},
  });

  try {
    getDb().run(
      `INSERT INTO accessibility_snapshots
        (snapshot_id, focused_app, backend_used,
         focused_element_role, focused_element_name,
         tree_summary_json, confidence, ts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        next.snapshotId,
        next.focusedApp,
        next.backendUsed,
        focusedEl?.role ?? null,
        focusedEl?.name ?? null,
        JSON.stringify(msg.tree_summary ?? {}),
        next.confidence,
        next.ts,
      ],
    );
    persistToFile();
  } catch (err) {
    // Don't let a write error block the in-memory update — cognition still
    // needs the latest snapshot even if persistence is briefly broken.
    console.warn(
      "[A11Y] Failed to persist snapshot:",
      err instanceof Error ? err.message : String(err),
    );
  }

  emitter.emit("snapshot", next);
  if (fallback) {
    emitter.emit("visual_fallback", fallback);
  }
}

export function getLatestAccessibility(): LatestAccessibility | null {
  return latest;
}

export function onAccessibilitySnapshot(
  listener: (snapshot: LatestAccessibility) => void,
): () => void {
  emitter.on("snapshot", listener);
  return () => emitter.off("snapshot", listener);
}

// Test-only.
export function _resetA11yState(): void {
  latest = null;
  emitter.removeAllListeners();
}
