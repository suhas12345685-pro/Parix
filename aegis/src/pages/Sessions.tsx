import type { SensorEvent, AuditEntry } from "../types";

interface Props {
  events: SensorEvent[];
  audit: AuditEntry[];
}

interface Session {
  id: string;
  trigger: string;
  startedAt: number;
  actions: number;
  state: "completed" | "active" | "failed";
  events: string[];
}

export function Sessions({ events, audit }: Props) {
  const sessions = buildSessions(events, audit);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="text-sm text-[#a99bb9]">
          {sessions.length} recent session{sessions.length !== 1 ? "s" : ""}
        </div>
        <div className="flex gap-3 text-xs">
          <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-cyan-300">
            {sessions.filter((s) => s.state === "completed").length} completed
          </span>
          <span className="rounded-full border border-pink-400/30 bg-pink-500/10 px-3 py-1 text-pink-300">
            {sessions.filter((s) => s.state === "failed").length} failed
          </span>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="card flex items-center justify-center py-16 text-sm text-[#a99bb9]">
          No sessions yet. Sensor events will create sessions when processed.
        </div>
      ) : (
        <div className="grid gap-3">
          {sessions.map((session) => (
            <div key={session.id} className="card">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <span
                    className={`h-3 w-3 rounded-full ${
                      session.state === "completed"
                        ? "bg-cyan-400 shadow-[0_0_14px_rgba(34,211,238,0.8)]"
                        : session.state === "active"
                          ? "bg-purple-400 shadow-[0_0_14px_rgba(168,85,247,0.8)] animate-pulse"
                          : "bg-pink-500 shadow-[0_0_14px_rgba(236,72,153,0.8)]"
                    }`}
                  />
                  <div>
                    <div className="text-base font-semibold text-white">
                      {session.trigger}
                    </div>
                    <div className="mt-0.5 font-mono text-xs text-[#7d708d]">
                      {session.id.slice(0, 16)}...
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <div className="text-center">
                    <div className="text-xs text-[#7d708d]">Actions</div>
                    <div className="mt-0.5 font-mono text-[#cfc3df]">
                      {session.actions}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-[#7d708d]">Started</div>
                    <div className="mt-0.5 text-[#cfc3df]">
                      {formatTime(session.startedAt)}
                    </div>
                  </div>
                  <span
                    className={`rounded-full border px-3 py-1 text-xs ${
                      session.state === "completed"
                        ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-300"
                        : session.state === "active"
                          ? "border-purple-400/30 bg-purple-500/10 text-purple-300"
                          : "border-pink-400/30 bg-pink-500/10 text-pink-300"
                    }`}
                  >
                    {session.state}
                  </span>
                </div>
              </div>
              {session.events.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {session.events.map((ev, i) => (
                    <span
                      key={i}
                      className="rounded-full border border-purple-400/20 px-3 py-1 text-xs text-[#b8aec5]"
                    >
                      {ev}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function buildSessions(events: SensorEvent[], audit: AuditEntry[]): Session[] {
  const sessions: Session[] = [];
  const seen = new Set<string>();

  for (const entry of audit) {
    if (!entry.taskId || seen.has(entry.taskId)) continue;
    seen.add(entry.taskId);

    const related = audit.filter((a) => a.taskId === entry.taskId);
    const hasSuccess = related.some((a) => a.action === "success");
    const hasFailure = related.some(
      (a) => a.action === "failure" || a.action === "error",
    );

    sessions.push({
      id: entry.taskId,
      trigger:
        entry.action.replace("execute:", "").replace("ingest:", "") || "task",
      startedAt: entry.ts ? new Date(entry.ts).getTime() : Date.now(),
      actions: related.length,
      state: hasSuccess ? "completed" : hasFailure ? "failed" : "active",
      events: related.map((a) => a.action).slice(0, 4),
    });
  }

  if (sessions.length === 0 && events.length > 0) {
    for (const ev of events.slice(0, 10)) {
      sessions.push({
        id: ev.id,
        trigger: ev.eventType,
        startedAt:
          typeof ev.timestamp === "number" && ev.timestamp < 1e12
            ? ev.timestamp * 1000
            : ev.timestamp,
        actions: 1,
        state: "completed",
        events: [ev.eventType],
      });
    }
  }

  return sessions.slice(0, 20);
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}
