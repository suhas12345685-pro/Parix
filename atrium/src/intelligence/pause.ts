/**
 * Pause Switch — lets the user pause/resume the Parix agent.
 *
 * When paused:
 *   - New sensor events are still logged (we don't lose data)
 *   - The engine skips processing (stays IDLE)
 *   - A "paused" notification is shown
 *
 * When resumed:
 *   - Queued events are processed normally
 *   - A "resumed" notification is shown
 */

import { audit } from "./audit.js";

let paused = false;
let pausedAt: number | null = null;
let pausedBy: string | null = null;

/**
 * Pause the agent. Events are still ingested but not processed.
 */
export function pause(reason = "user_request"): void {
  if (paused) return;
  paused = true;
  pausedAt = Date.now();
  pausedBy = reason;

  audit({
    actor: "user",
    action: "pause",
    payload: { reason },
  });

  console.log(`[ATRIUM] ⏸  Paused (reason=${reason})`);
}

/**
 * Resume the agent.
 */
export function resume(): void {
  if (!paused) return;

  const duration = pausedAt ? Date.now() - pausedAt : 0;

  audit({
    actor: "user",
    action: "resume",
    payload: { paused_for_ms: duration, was_paused_by: pausedBy },
  });

  paused = false;
  pausedAt = null;
  pausedBy = null;

  console.log(
    `[ATRIUM] ▶  Resumed (was paused for ${Math.round(duration / 1000)}s)`,
  );
}

/**
 * Toggle pause state. Returns new state.
 */
export function toggle(): boolean {
  if (paused) {
    resume();
  } else {
    pause();
  }
  return paused;
}

/**
 * Check if the agent is currently paused.
 */
export function isPaused(): boolean {
  return paused;
}

/**
 * Get pause status info.
 */
export function getStatus(): {
  paused: boolean;
  pausedAt: number | null;
  pausedBy: string | null;
  pausedForMs: number | null;
} {
  return {
    paused,
    pausedAt,
    pausedBy,
    pausedForMs: pausedAt ? Date.now() - pausedAt : null,
  };
}
