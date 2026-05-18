import type { SensorEvent } from "../types";
import { EmptyState } from "./EmptyState";

interface Props {
  events: SensorEvent[];
}

const EVENT_COLORS: Record<string, string> = {
  terminal_error: "text-rose-200",
  disk_low: "text-orange-200",
  cpu_high: "text-amber-200",
  memory_high: "text-amber-200",
  swap_high: "text-amber-200",
  battery_low: "text-rose-200",
  clipboard_sensitive_data: "text-violet-200",
  "silent:idle_shutdown": "text-orange-200",
  "silent:tab_overload": "text-sky-200",
  "silent:long_uptime": "text-zinc-300",
};

export function EventFeed({ events }: Props) {
  if (events.length === 0) {
    return (
      <section className="card">
        <div className="mb-3 text-xs font-medium uppercase tracking-wide text-[#8f82a0]">
          Live Event Feed
        </div>
        <EmptyState
          title="No events captured"
          detail="Sensor, intent, and action events will appear here as Atrium receives them."
        />
      </section>
    );
  }

  return (
    <div className="card max-h-96 overflow-y-auto">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wide text-[#8f82a0]">
        Live Event Feed
        </div>
        <span className="rounded-md border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-xs text-cyan-100">
          {events.length}
        </span>
      </div>
      <div className="space-y-2">
        {events.map((event) => (
          <div
            key={event.id}
            className="flex items-start gap-3 rounded-md border border-purple-400/15 bg-[#0b0710] px-3 py-2"
          >
            <div className="mt-0.5 flex-shrink-0">
              <span
                className={`status-dot ${
                  event.confidence >= 0.8
                    ? "bg-emerald-500"
                    : event.confidence >= 0.6
                      ? "bg-amber-500"
                      : "bg-zinc-400"
                }`}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className={`font-mono text-sm font-medium ${
                    EVENT_COLORS[event.eventType] ?? "text-[#d8cde6]"
                  }`}
                >
                  {event.eventType}
                </span>
                <span className="text-xs text-zinc-500">
                  {(event.confidence * 100).toFixed(0)}%
                </span>
              </div>
              <div className="mt-0.5 truncate font-mono text-xs text-[#8f82a0]">
                {JSON.stringify(event.data).slice(0, 120)}
              </div>
            </div>
            <div className="flex-shrink-0 text-xs text-[#8f82a0]">
              {formatTime(event.timestamp)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatTime(ts: number): string {
  const d = new Date(typeof ts === "number" && ts < 1e12 ? ts * 1000 : ts);
  return d.toLocaleTimeString();
}
