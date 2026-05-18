import type { SystemHealth } from "../types";

interface Props {
  health: SystemHealth;
  connected: boolean;
}

export function Instances({ health, connected }: Props) {
  const { dashboard } = health;
  const uptime = formatUptime(dashboard.uptime);

  const instances = [
    {
      name: "Atrium",
      role: "Brain — state machine, LLM router, cognition",
      status: connected ? "running" : "offline",
      pid: "node",
      uptime,
      port: "8766",
    },
    {
      name: "Hands",
      role: "Executor — sensors, CLI, vision, voice",
      status: dashboard.handsStatus === "CONNECTED" ? "running" : "offline",
      pid: "python",
      uptime: dashboard.handsStatus === "CONNECTED" ? uptime : "—",
      port: "8765",
    },
    {
      name: "Aegis Relay",
      role: "WebSocket relay to dashboard UI",
      status: connected ? "running" : "offline",
      pid: "ws",
      uptime,
      port: "8766",
    },
    {
      name: "Shadow Loop",
      role: "Background health monitor on Hands",
      status: dashboard.handsStatus === "CONNECTED" ? "running" : "stopped",
      pid: "thread",
      uptime: dashboard.handsStatus === "CONNECTED" ? uptime : "—",
      port: "—",
    },
    {
      name: "OS Watcher",
      role: "Terminal error + system event sensor",
      status: dashboard.handsStatus === "CONNECTED" ? "running" : "stopped",
      pid: "asyncio",
      uptime: dashboard.handsStatus === "CONNECTED" ? uptime : "—",
      port: "—",
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="text-sm text-[#a99bb9]">
          {instances.filter((i) => i.status === "running").length} of{" "}
          {instances.length} processes active
        </div>
        <span
          className={`rounded-full border px-4 py-2 text-sm font-medium ${
            connected
              ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-300"
              : "border-pink-500/40 bg-pink-500/10 text-pink-300"
          }`}
        >
          {connected ? "System Online" : "System Offline"}
        </span>
      </div>

      <div className="grid gap-3">
        {instances.map((inst) => (
          <div
            key={inst.name}
            className="card flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-4">
              <span
                className={`h-3 w-3 rounded-full ${
                  inst.status === "running"
                    ? "bg-cyan-400 shadow-[0_0_14px_rgba(34,211,238,0.8)]"
                    : "bg-[#4c3d5b]"
                }`}
              />
              <div>
                <div className="text-base font-semibold text-white">
                  {inst.name}
                </div>
                <div className="mt-0.5 text-sm text-[#a99bb9]">{inst.role}</div>
              </div>
            </div>
            <div className="flex items-center gap-6 text-sm">
              <div className="text-center">
                <div className="text-xs text-[#7d708d]">Runtime</div>
                <div className="mt-0.5 font-mono text-[#cfc3df]">
                  {inst.pid}
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-[#7d708d]">Port</div>
                <div className="mt-0.5 font-mono text-[#cfc3df]">
                  {inst.port}
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-[#7d708d]">Uptime</div>
                <div className="mt-0.5 font-mono text-[#cfc3df]">
                  {inst.uptime}
                </div>
              </div>
              <span
                className={`rounded-full border px-3 py-1 text-xs ${
                  inst.status === "running"
                    ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-300"
                    : "border-[#4c3d5b] text-[#7d708d]"
                }`}
              >
                {inst.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
