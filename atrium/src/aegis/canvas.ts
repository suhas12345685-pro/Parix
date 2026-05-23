/**
 * Agent-driven Canvas.
 *
 * A live document the agent writes and updates, rendered in the Aegis Canvas
 * view. The engine dispatches a `canvas` task to set its content; the relay
 * registers a broadcaster so updates stream to connected dashboards, and
 * includes the latest canvas in the health snapshot for new clients.
 *
 * Kept as a standalone module (no relay/council imports) to avoid a circular
 * dependency between the engine and the relay.
 */

export interface CanvasState {
  title: string;
  content: string;
  format: "markdown" | "text";
  updatedAt: number;
}

type Broadcaster = (msg: Record<string, unknown>) => void;

let latest: CanvasState | null = null;
let broadcaster: Broadcaster | null = null;

/** Relay calls this so canvas updates can be pushed to dashboard clients. */
export function registerCanvasBroadcaster(fn: Broadcaster): void {
  broadcaster = fn;
}

export function getCanvas(): CanvasState | null {
  return latest;
}

export function setCanvas(input: {
  title?: string;
  content: string;
  format?: "markdown" | "text";
}): CanvasState {
  latest = {
    title: input.title?.trim() || "Canvas",
    content: input.content ?? "",
    format: input.format === "text" ? "text" : "markdown",
    updatedAt: Date.now(),
  };
  broadcaster?.({ type: "CANVAS_UPDATE", canvas: latest });
  return latest;
}

export function clearCanvas(): void {
  latest = null;
  broadcaster?.({ type: "CANVAS_UPDATE", canvas: null });
}
