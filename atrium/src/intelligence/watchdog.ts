import { saveCheckpoint, getLastCheckpoint } from "../memory/db.js";

export interface WorldStateCheckpoint {
  atrium_state: string;
  pending_tasks: string[];
  last_event_id: string | undefined;
  hands_status: string;
  timestamp: number;
}

let currentStateGetter: (() => WorldStateCheckpoint) | null = null;

export function registerStateGetter(getter: () => WorldStateCheckpoint): void {
  currentStateGetter = getter;
}

export function snapshot(): void {
  if (!currentStateGetter) return;
  const state = currentStateGetter();
  saveCheckpoint(JSON.stringify(state));
  console.log("[WATCHDOG] Checkpoint saved at", state.timestamp);
}

export function resumeFromCheckpoint(): WorldStateCheckpoint | null {
  const raw = getLastCheckpoint();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    // Backward compat: old checkpoints used council_state
    const state: WorldStateCheckpoint = {
      ...parsed,
      atrium_state: parsed.atrium_state ?? parsed.council_state ?? "IDLE",
    };
    if (state.atrium_state === "ACTING" || state.atrium_state === "THINKING") {
      state.atrium_state = "IDLE";
    }
    console.log(
      `[WATCHDOG] Resuming from checkpoint (ts=${state.timestamp}, state=${state.atrium_state})`,
    );
    return state;
  } catch {
    console.error("[WATCHDOG] Failed to parse checkpoint");
    return null;
  }
}

export function startWatchdogCron(
  intervalMs = 60_000,
): ReturnType<typeof setInterval> {
  return setInterval(() => {
    try {
      snapshot();
    } catch (err) {
      console.error("[WATCHDOG] Snapshot failed:", err);
    }
  }, intervalMs);
}
