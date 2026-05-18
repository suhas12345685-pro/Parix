import type { SystemHealth } from "../types";

interface Props {
  health: SystemHealth;
  onPause: () => void;
  onResume: () => void;
  onFlush: () => void;
}

export function Settings({ health, onPause, onResume, onFlush }: Props) {
  const { dashboard, governor } = health;

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-bold text-gray-100">Settings</h1>

      {/* Pause / Resume */}
      <div className="card">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-gray-500">
          Agent Control
        </h2>
        <div className="flex items-center gap-4">
          <button
            onClick={dashboard.paused ? onResume : onPause}
            className={`rounded-lg px-6 py-2.5 text-sm font-medium transition-colors ${
              dashboard.paused
                ? "bg-green-600 text-white hover:bg-green-500"
                : "bg-yellow-600 text-white hover:bg-yellow-500"
            }`}
          >
            {dashboard.paused ? "Resume Agent" : "Pause Agent"}
          </button>

          {dashboard.paused && dashboard.pausedAt && (
            <span className="text-sm text-gray-400">
              Paused for {formatDuration(Date.now() - dashboard.pausedAt)}
            </span>
          )}
        </div>

        {dashboard.queueDepth > 0 && (
          <div className="mt-4 flex items-center gap-3 rounded-lg border border-orange-900/50 bg-orange-900/10 px-4 py-2">
            <span className="text-sm text-orange-400">
              {dashboard.queueDepth} event(s) queued
            </span>
            <button
              onClick={onFlush}
              className="rounded bg-gray-800 px-3 py-1 text-xs text-gray-300 transition-colors hover:bg-gray-700"
            >
              Flush Queue
            </button>
          </div>
        )}
      </div>

      {/* Governor Limits */}
      <div className="card">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-gray-500">
          Governor Rate Limits
        </h2>
        <div className="grid grid-cols-3 gap-4">
          <LimitBar label="Per Minute" current={governor.minuteCount} max={5} />
          <LimitBar label="Per Hour" current={governor.hourCount} max={60} />
          <LimitBar
            label="Daily Tokens"
            current={governor.dailyTokens}
            max={governor.dailyLimit}
            formatValue={(v) => `${(v / 1000).toFixed(1)}k`}
          />
        </div>
      </div>

      {/* System Info */}
      <div className="card">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-gray-500">
          System Info
        </h2>
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          <span className="text-gray-500">Engine State</span>
          <span className="font-mono text-gray-300">
            {dashboard.atriumState}
          </span>

          <span className="text-gray-500">Hands Status</span>
          <span className="font-mono text-gray-300">
            {dashboard.handsStatus}
          </span>

          <span className="text-gray-500">Uptime</span>
          <span className="font-mono text-gray-300">
            {formatDuration(dashboard.uptime)}
          </span>

          <span className="text-gray-500">Queue Depth</span>
          <span className="font-mono text-gray-300">
            {dashboard.queueDepth}
          </span>
        </div>
      </div>
    </div>
  );
}

function LimitBar({
  label,
  current,
  max,
  formatValue,
}: {
  label: string;
  current: number;
  max: number;
  formatValue?: (v: number) => string;
}) {
  const pct = Math.min(100, (current / max) * 100);
  const fmt = formatValue ?? ((v: number) => String(v));
  const barColor =
    pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-yellow-500" : "bg-parix-500";

  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-gray-500">{label}</span>
        <span className="text-gray-400">
          {fmt(current)} / {fmt(max)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-800">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}
