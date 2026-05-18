import type { SystemHealth, SensorEvent } from "../types";
import { StatCard } from "../components/StatCard";
import { EventFeed } from "../components/EventFeed";
import { PlanProgress } from "../components/PlanProgress";
import { CognitiveLoad } from "../components/CognitiveLoad";
import { Narratives } from "../components/Narratives";
import { AttentionFocus } from "../components/AttentionFocus";
import { AccessibilityFocus } from "../components/AccessibilityFocus";
import { CouncilStatus } from "../components/CouncilStatus";

interface Props {
  health: SystemHealth;
  events: SensorEvent[];
  connected: boolean;
  lastMessageAt: number | null;
}

export function Dashboard({ health, events, connected, lastMessageAt }: Props) {
  const { dashboard, skills, dlq, cognition } = health;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="text-sm text-zinc-500">Atrium runtime snapshot</div>
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              connected ? "bg-emerald-500" : "bg-rose-500"
            }`}
          />
          <span className="text-zinc-500">
            {connected ? "Live" : "Reconnecting..."}
          </span>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
        <CouncilStatus
          state={dashboard.atriumState}
          paused={dashboard.paused}
          handsStatus={dashboard.handsStatus}
          queueDepth={dashboard.queueDepth}
          lastUpdate={dashboard.lastUpdate}
        />
        <section className="rounded-lg border border-purple-400/15 bg-[#120b18]/70 p-4">
          <div className="text-xs uppercase tracking-wide text-[#8f82a0]">
            Relay Pulse
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-[#8f82a0]">Last message</div>
              <div className="mt-1 text-sm font-semibold text-white">
                {formatLastMessage(lastMessageAt)}
              </div>
            </div>
            <div>
              <div className="text-xs text-[#8f82a0]">Buffer</div>
              <div className="mt-1 text-sm font-semibold text-white">
                {events.length} events
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Engine State"
          value={dashboard.paused ? "PAUSED" : dashboard.atriumState}
          color={stateColor(dashboard.atriumState, dashboard.paused)}
        />
        <StatCard
          label="Hands"
          value={dashboard.handsStatus}
          color={
            dashboard.handsStatus === "CONNECTED"
              ? "text-emerald-600"
              : "text-rose-600"
          }
        />
        <StatCard
          label="Queue"
          value={dashboard.queueDepth}
          sub="pending events"
        />
        <StatCard label="Uptime" value={formatUptime(dashboard.uptime)} />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Skills"
          value={skills.totalPatterns}
          sub={`${(skills.hitRate * 100).toFixed(0)}% hit rate`}
          color="text-sky-700"
        />
        <StatCard
          label="DLQ Pending"
          value={dlq.pending}
          color={dlq.pending > 0 ? "text-amber-600" : "text-zinc-900"}
        />
        <StatCard
          label="DLQ Exhausted"
          value={dlq.exhausted}
          color={dlq.exhausted > 0 ? "text-rose-600" : "text-zinc-900"}
        />
        <StatCard label="Events" value={events.length} sub="in buffer" />
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        <CognitiveLoad
          load={cognition.metacognition.cognitiveLoad}
          breakdown={{
            plans: cognition.activePlan ? 1 : 0,
            blockers: 0,
            uncertainty: 0,
          }}
        />
        <AttentionFocus
          focus={cognition.attention.focus}
          strength={cognition.attention.strength}
          admitRate={cognition.attention.admitRate}
          suppressedCount={cognition.attention.suppressedCount}
        />
        <AccessibilityFocus accessibility={cognition.accessibility ?? null} />
        <div className="xl:col-span-3">
          <PlanProgress plan={cognition.activePlan} />
        </div>
      </div>

      <Narratives narratives={cognition.activeNarratives} />

      <EventFeed events={events} />
    </div>
  );
}

function stateColor(state: string, paused: boolean): string {
  if (paused) return "text-gray-400";
  switch (state) {
    case "IDLE":
      return "text-zinc-700";
    case "OBSERVING":
      return "text-sky-700";
    case "THINKING":
      return "text-amber-700";
    case "ACTING":
      return "text-emerald-700";
    case "WAITING":
      return "text-orange-700";
    case "ERROR":
      return "text-rose-700";
    default:
      return "text-zinc-700";
  }
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatLastMessage(ts: number | null): string {
  if (!ts) return "Waiting";
  return new Date(ts).toLocaleTimeString();
}
