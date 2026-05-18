import type { SystemHealth } from "../types";

interface Props {
  health: SystemHealth;
  connected: boolean;
}

export function Nodes({ health, connected }: Props) {
  const { dashboard } = health;

  const nodes = [
    {
      id: "hands-primary",
      name: "Hands (Primary)",
      type: "executor",
      platform: detectPlatform(),
      status:
        dashboard.handsStatus === "CONNECTED" ? "connected" : "disconnected",
      capabilities: ["cli", "screenshot", "vision", "sensors", "voice"],
      port: 8765,
    },
    {
      id: "atrium-brain",
      name: "Atrium Brain",
      type: "brain",
      platform: "Node.js",
      status: connected ? "connected" : "disconnected",
      capabilities: ["council", "llm-router", "cognition", "audit", "governor"],
      port: 8766,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="text-sm text-[#a99bb9]">
          {nodes.filter((n) => n.status === "connected").length} node
          {nodes.filter((n) => n.status === "connected").length !== 1
            ? "s"
            : ""}{" "}
          connected
        </div>
      </div>

      <div className="grid gap-4">
        {nodes.map((node) => (
          <div key={node.id} className="card">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-xl border ${
                    node.status === "connected"
                      ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-300"
                      : "border-[#4c3d5b] bg-[#1a1225] text-[#7d708d]"
                  }`}
                >
                  {node.type === "executor" ? "⌬" : "◇"}
                </div>
                <div>
                  <div className="text-lg font-semibold text-white">
                    {node.name}
                  </div>
                  <div className="mt-0.5 text-sm text-[#a99bb9]">
                    {node.platform} — port {node.port}
                  </div>
                </div>
              </div>
              <span
                className={`rounded-full border px-4 py-2 text-sm font-medium ${
                  node.status === "connected"
                    ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-300"
                    : "border-pink-500/30 bg-pink-500/10 text-pink-300"
                }`}
              >
                {node.status}
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {node.capabilities.map((cap) => (
                <span
                  key={cap}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    node.status === "connected"
                      ? "border-purple-400/30 bg-purple-500/10 text-purple-200"
                      : "border-[#3a2d47] text-[#7d708d]"
                  }`}
                >
                  {cap}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3 className="text-base font-semibold text-white">System Stats</h3>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <div>
            <div className="text-xs text-[#7d708d]">Queue Depth</div>
            <div className="mt-1 text-lg font-semibold text-white">
              {dashboard.queueDepth}
            </div>
          </div>
          <div>
            <div className="text-xs text-[#7d708d]">Engine State</div>
            <div className="mt-1 text-lg font-semibold text-white">
              {dashboard.atriumState}
            </div>
          </div>
          <div>
            <div className="text-xs text-[#7d708d]">Skills Loaded</div>
            <div className="mt-1 text-lg font-semibold text-white">
              {health.skills.totalPatterns}
            </div>
          </div>
          <div>
            <div className="text-xs text-[#7d708d]">DLQ Pending</div>
            <div className="mt-1 text-lg font-semibold text-white">
              {health.dlq.pending}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function detectPlatform(): string {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "Windows (Python)";
  if (ua.includes("mac")) return "macOS (Python)";
  return "Linux (Python)";
}
