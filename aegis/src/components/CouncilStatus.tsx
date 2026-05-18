import type { AtriumState } from "../types";

interface CouncilStatusProps {
  state: AtriumState;
  paused?: boolean;
  handsStatus?: string;
  queueDepth?: number;
  lastUpdate?: number;
}

const stateLabels: Record<AtriumState, string> = {
  IDLE: "Idle",
  OBSERVING: "Observing",
  THINKING: "Thinking",
  ACTING: "Acting",
  WAITING: "Waiting",
  ERROR: "Error",
};

export function CouncilStatus({
  state,
  paused = false,
  handsStatus = "UNKNOWN",
  queueDepth = 0,
  lastUpdate,
}: CouncilStatusProps) {
  const activeState = paused ? "PAUSED" : state;

  return (
    <section className="rounded-lg border border-purple-400/15 bg-[#120b18]/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xs font-medium uppercase tracking-wide text-[#8f82a0]">
            Council
          </h2>
          <p
            className={`mt-1 text-2xl font-semibold ${stateColor(state, paused)}`}
          >
            {paused ? "Paused" : stateLabels[state]}
          </p>
        </div>
        <span
          className={`h-3 w-3 rounded-full ${paused ? "bg-gray-500" : dotColor(state)}`}
          aria-label={`Council state ${activeState}`}
        />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-[#8f82a0]">Hands</p>
          <p className="mt-1 truncate text-[#f8f2ff]">{handsStatus}</p>
        </div>
        <div>
          <p className="text-[#8f82a0]">Queue</p>
          <p className="mt-1 text-[#f8f2ff]">{queueDepth}</p>
        </div>
        <div>
          <p className="text-[#8f82a0]">Updated</p>
          <p className="mt-1 truncate text-[#f8f2ff]">
            {formatLastUpdate(lastUpdate)}
          </p>
        </div>
      </div>
    </section>
  );
}

function stateColor(state: AtriumState, paused: boolean): string {
  if (paused) return "text-zinc-400";
  switch (state) {
    case "OBSERVING":
      return "text-sky-300";
    case "THINKING":
      return "text-amber-300";
    case "ACTING":
      return "text-emerald-300";
    case "WAITING":
      return "text-orange-300";
    case "ERROR":
      return "text-rose-300";
    default:
      return "text-white";
  }
}

function dotColor(state: AtriumState): string {
  switch (state) {
    case "ERROR":
      return "bg-rose-400";
    case "WAITING":
    case "THINKING":
      return "bg-amber-300";
    case "ACTING":
    case "OBSERVING":
      return "bg-emerald-300";
    default:
      return "bg-zinc-400";
  }
}

function formatLastUpdate(lastUpdate?: number): string {
  if (!lastUpdate) return "Never";
  return new Date(lastUpdate).toLocaleTimeString();
}
