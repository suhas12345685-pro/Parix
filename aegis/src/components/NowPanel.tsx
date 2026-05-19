import type { AtriumState, SensorEvent, SystemHealth } from "../types";

interface NowPanelProps {
  health: SystemHealth;
  events: SensorEvent[];
  connected: boolean;
}

const STATE_LABELS: Record<AtriumState, string> = {
  IDLE: "Idle",
  OBSERVING: "Observing",
  THINKING: "Thinking",
  ACTING: "Acting",
  WAITING: "Waiting",
  ERROR: "Error",
};

export function NowPanel({ health, events, connected }: NowPanelProps) {
  const { dashboard, cognition } = health;
  const state = dashboard.paused ? "PAUSED" : dashboard.atriumState;
  const headline = primaryActivity(health, events);
  const supporting = supportingActivity(health, events);

  return (
    <div className="border-t border-fuchsia-400/10 bg-[#0a0610]/85 px-6 py-2.5 backdrop-blur-sm">
      <div className="flex items-center gap-4 text-xs">
        <span
          className={`flex flex-shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 font-medium ${stateBadgeClasses(state)}`}
          aria-label={`Engine state ${state}`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${stateDotClasses(state, connected)}`}
          />
          {state === "PAUSED"
            ? "Paused"
            : STATE_LABELS[state as AtriumState] ?? state}
        </span>

        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-white" title={headline}>
            {headline}
          </div>
          {supporting && (
            <div
              className="mt-0.5 truncate text-[#9d91ad]"
              title={supporting}
            >
              {supporting}
            </div>
          )}
        </div>

        <div className="hidden flex-shrink-0 items-center gap-3 text-[#9d91ad] sm:flex">
          {cognition.activePlan && (
            <span title="Active plan progress">
              <span className="tabular-nums text-white">
                {cognition.activePlan.progress.done}/
                {cognition.activePlan.progress.total}
              </span>{" "}
              steps
            </span>
          )}
          {dashboard.queueDepth > 0 && (
            <span title="Queued events">
              queue{" "}
              <span className="tabular-nums text-white">
                {dashboard.queueDepth}
              </span>
            </span>
          )}
          <span title="Hands executor status">
            hands{" "}
            <span
              className={`font-medium ${
                dashboard.handsStatus?.toUpperCase() === "CONNECTED"
                  ? "text-emerald-300"
                  : "text-rose-300"
              }`}
            >
              {(dashboard.handsStatus ?? "unknown").toLowerCase()}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

function primaryActivity(
  health: SystemHealth,
  events: SensorEvent[],
): string {
  const { dashboard, cognition } = health;

  if (dashboard.paused) {
    return "Engine paused — waiting for resume.";
  }

  if (cognition.activePlan) {
    return cognition.activePlan.rootGoal;
  }

  if (cognition.attention.focus) {
    return `Focused on ${cognition.attention.focus}`;
  }

  const latest = events[0];
  if (latest) {
    return summarizeEvent(latest);
  }

  if (dashboard.atriumState === "IDLE") {
    return "Watching. Nothing on the plate.";
  }

  return STATE_LABELS[dashboard.atriumState] ?? dashboard.atriumState;
}

function supportingActivity(
  health: SystemHealth,
  events: SensorEvent[],
): string | null {
  const { dashboard, cognition } = health;
  const accessibility = cognition.accessibility;

  if (cognition.activePlan) {
    const active = cognition.activePlan.nodes.find(
      (n) => n.status?.toLowerCase() === "active",
    );
    if (active) return `Step: ${active.goal}`;
    return `${cognition.activePlan.progress.percent}% complete`;
  }

  if (accessibility?.focusedElement) {
    const el = accessibility.focusedElement;
    return `${accessibility.focusedApp} → ${el.role}${el.name ? ` "${el.name}"` : ""}`;
  }

  if (dashboard.atriumState === "OBSERVING" && events[0]) {
    return summarizeEvent(events[0]);
  }

  return null;
}

function summarizeEvent(event: SensorEvent): string {
  const subject =
    (event.data?.title as string) ||
    (event.data?.summary as string) ||
    (event.data?.text as string) ||
    "";
  const head = event.eventType.replace(/_/g, " ");
  return subject ? `${head}: ${subject.slice(0, 80)}` : head;
}

function stateBadgeClasses(state: string): string {
  switch (state) {
    case "PAUSED":
      return "border-zinc-500/30 bg-zinc-500/10 text-zinc-300";
    case "OBSERVING":
      return "border-sky-400/30 bg-sky-400/10 text-sky-200";
    case "THINKING":
      return "border-amber-400/30 bg-amber-400/10 text-amber-200";
    case "ACTING":
      return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
    case "WAITING":
      return "border-orange-400/30 bg-orange-400/10 text-orange-200";
    case "ERROR":
      return "border-rose-400/30 bg-rose-400/10 text-rose-200";
    default:
      return "border-purple-400/20 bg-purple-500/10 text-[#c9bdd8]";
  }
}

function stateDotClasses(state: string, connected: boolean): string {
  if (!connected) return "bg-zinc-500";
  switch (state) {
    case "PAUSED":
      return "bg-zinc-400";
    case "OBSERVING":
      return "bg-sky-300";
    case "THINKING":
      return "bg-amber-300 animate-pulse";
    case "ACTING":
      return "bg-emerald-300 animate-pulse";
    case "WAITING":
      return "bg-orange-300";
    case "ERROR":
      return "bg-rose-400";
    default:
      return "bg-fuchsia-400";
  }
}
