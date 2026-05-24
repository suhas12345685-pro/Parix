import type { McpSnapshot, McpToolSnapshot } from "../types";
import { EmptyState } from "../components/EmptyState";

interface Props {
  mcp: McpSnapshot;
  connected: boolean;
}

export function McpTools({ mcp, connected }: Props) {
  const servers = mcp.servers ?? [];
  const tools = mcp.tools ?? [];

  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-3">
        <Metric label="Configured Servers" value={mcp.serverCount} />
        <Metric label="Connected Servers" value={mcp.connectedServerCount} />
        <Metric label="Available Tools" value={mcp.toolCount} />
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">MCP Servers</h2>
            <p className="mt-1 font-mono text-xs text-[#8f82a0]">
              {mcp.configPath}
            </p>
          </div>
          <span
            className={`rounded-md border px-2 py-1 text-xs ${
              connected
                ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-100"
                : "border-pink-300/25 bg-pink-300/10 text-pink-100"
            }`}
          >
            {connected ? "Live" : "Cached"}
          </span>
        </div>

        {servers.length === 0 ? (
          <div>
            <EmptyState
              title="No MCP servers configured"
              detail="Run Hatchery onboarding to generate mcp.servers.json."
            />
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {servers.map((server) => (
              <div
                key={server.name}
                className="rounded-lg border border-purple-400/20 bg-[#0e0714] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-mono text-sm font-semibold text-white">
                      {server.name}
                    </div>
                    <div className="mt-1 text-xs uppercase tracking-wide text-[#8f82a0]">
                      {server.transport}
                    </div>
                  </div>
                  <ServerStatus
                    enabled={server.enabled}
                    connected={server.connected}
                    error={server.error}
                  />
                </div>
                <div className="mt-4 text-sm text-[#c9bdd8]">
                  {server.toolCount} tool{server.toolCount === 1 ? "" : "s"}
                </div>
                {server.error && (
                  <div className="mt-3 rounded-md border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs leading-5 text-rose-100">
                    {server.error}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[#8f82a0]">
            Tool Catalog
          </h2>
          <span className="rounded-md border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-xs text-cyan-100">
            {tools.length}
          </span>
        </div>

        {tools.length === 0 ? (
          <EmptyState
            title="No MCP tools connected"
            detail="Connected server tools will appear here after Atrium boots."
          />
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {tools.map((tool) => (
              <ToolRow key={`${tool.server}.${tool.name}`} tool={tool} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wide text-[#8f82a0]">
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold text-white">{value}</div>
    </div>
  );
}

function ServerStatus({
  enabled,
  connected,
  error,
}: {
  enabled: boolean;
  connected: boolean;
  error?: string;
}) {
  const label = !enabled
    ? "Disabled"
    : error
      ? "Error"
      : connected
        ? "Connected"
        : "Pending";
  const classes = !enabled
    ? "border-zinc-400/20 bg-zinc-400/10 text-zinc-200"
    : error
      ? "border-rose-400/25 bg-rose-500/10 text-rose-100"
      : connected
        ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
        : "border-amber-300/25 bg-amber-300/10 text-amber-100";
  return (
    <span className={`rounded-md border px-2 py-1 text-xs ${classes}`}>
      {label}
    </span>
  );
}

function ToolRow({ tool }: { tool: McpToolSnapshot }) {
  return (
    <article className="rounded-lg border border-purple-400/20 bg-[#0e0714] p-4">
      <div className="font-mono text-sm font-semibold text-cyan-100">
        {tool.server}.{tool.name}
      </div>
      {tool.description && (
        <p className="mt-2 text-sm leading-6 text-[#c9bdd8]">
          {tool.description}
        </p>
      )}
      {tool.inputSchema !== undefined && (
        <pre className="mt-3 max-h-40 overflow-auto rounded-md border border-purple-400/15 bg-black/30 p-3 text-xs leading-5 text-[#b8aec5]">
          {JSON.stringify(tool.inputSchema, null, 2)}
        </pre>
      )}
    </article>
  );
}
