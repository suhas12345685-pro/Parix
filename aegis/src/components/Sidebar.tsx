import type { AtriumState } from "../types";
import type { Page } from "../App";

interface Props {
  page: Page;
  onNavigate: (page: Page) => void;
  connected: boolean;
  state: AtriumState;
  paused: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({
  page,
  onNavigate,
  connected,
  state,
  paused,
  collapsed = false,
}: Props) {
  const stateClass = paused ? "status-paused" : `status-${state.toLowerCase()}`;

  if (collapsed) {
    return (
      <aside className="flex w-14 flex-shrink-0 flex-col items-center border-r border-fuchsia-500/20 bg-[#0c0712]/80 py-4">
        <div className="mb-5 flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-pink-500 via-fuchsia-600 to-purple-700 text-sm font-bold text-white shadow-[0_0_18px_rgba(236,72,153,0.5)]">
          P
        </div>
        <div className="mb-5">
          <span className={`status-dot ${stateClass}`} />
        </div>
        <nav className="flex flex-1 flex-col items-center gap-1 overflow-y-auto">
          {[
            { page: "chat" as Page, icon: "▱" },
            { page: "overview" as Page, icon: "⌁" },
            { page: "channels" as Page, icon: "↗" },
            { page: "instances" as Page, icon: "◇" },
            { page: "sessions" as Page, icon: "◷" },
            { page: "cron" as Page, icon: "◌" },
            { page: "skills" as Page, icon: "✧" },
            { page: "nodes" as Page, icon: "⌬" },
            { page: "config" as Page, icon: "⚙" },
            { page: "debug" as Page, icon: "✺" },
            { page: "logs" as Page, icon: "▤" },
            { page: "docs" as Page, icon: "▣" },
          ].map((item) => (
            <button
              key={item.page}
              type="button"
              onClick={() => onNavigate(item.page)}
              className={`flex h-9 w-9 items-center justify-center rounded-lg text-base transition ${
                page === item.page
                  ? "bg-pink-500/20 text-pink-300 shadow-[inset_0_0_0_1px_rgba(236,72,153,0.2)]"
                  : "text-[#9d91ad] hover:bg-purple-500/10 hover:text-white"
              }`}
              title={pageTitle(item.page)}
            >
              {item.icon}
            </button>
          ))}
        </nav>
      </aside>
    );
  }

  return (
    <aside className="flex w-56 flex-shrink-0 flex-col border-r border-fuchsia-500/20 bg-[#0c0712]/80 py-4 px-4">
      <div className="mb-5 flex items-center gap-3 px-1">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-pink-500 via-fuchsia-600 to-purple-700 text-sm font-bold text-white shadow-[0_0_18px_rgba(236,72,153,0.5)]">
          P
        </div>
        <div className="min-w-0">
          <div className="text-base font-bold leading-5 text-white">PARIX</div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-pink-400/80">
            Aegis
          </div>
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-purple-400/15 bg-[#170e21]/50 px-3 py-2.5">
        <div className="flex items-center gap-2 text-sm">
          <span className={`status-dot ${stateClass}`} />
          <span className="font-semibold text-white">
            {paused ? "PAUSED" : state}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-[#b8aec5]">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              connected
                ? "bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]"
                : "bg-pink-500 shadow-[0_0_10px_rgba(236,72,153,0.8)]"
            }`}
          />
          {connected ? "Connected" : "Disconnected"}
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-3 overflow-y-auto">
        <NavGroup label="Chat">
          <NavButton
            page="chat"
            current={page}
            onNavigate={onNavigate}
            icon="▱"
            label="Chat"
          />
        </NavGroup>

        <NavGroup label="Control">
          <NavButton
            page="overview"
            current={page}
            onNavigate={onNavigate}
            icon="⌁"
            label="Overview"
          />
          <NavButton
            page="channels"
            current={page}
            onNavigate={onNavigate}
            icon="↗"
            label="Channels"
          />
          <NavButton
            page="instances"
            current={page}
            onNavigate={onNavigate}
            icon="◇"
            label="Instances"
          />
          <NavButton
            page="sessions"
            current={page}
            onNavigate={onNavigate}
            icon="◷"
            label="Sessions"
          />
          <NavButton
            page="cron"
            current={page}
            onNavigate={onNavigate}
            icon="◌"
            label="Cron Jobs"
          />
        </NavGroup>

        <NavGroup label="Agent">
          <NavButton
            page="skills"
            current={page}
            onNavigate={onNavigate}
            icon="✧"
            label="Skills"
          />
          <NavButton
            page="nodes"
            current={page}
            onNavigate={onNavigate}
            icon="⌬"
            label="Nodes"
          />
        </NavGroup>

        <NavGroup label="Settings">
          <NavButton
            page="config"
            current={page}
            onNavigate={onNavigate}
            icon="⚙"
            label="Config"
          />
          <NavButton
            page="debug"
            current={page}
            onNavigate={onNavigate}
            icon="✺"
            label="Debug"
          />
          <NavButton
            page="logs"
            current={page}
            onNavigate={onNavigate}
            icon="▤"
            label="Logs"
          />
        </NavGroup>
      </nav>

      <div className="mt-2 border-t border-purple-400/10 pt-2">
        <NavGroup label="Resources">
          <NavButton
            page="docs"
            current={page}
            onNavigate={onNavigate}
            icon="▣"
            label="Docs"
          />
        </NavGroup>
      </div>
    </aside>
  );
}

function pageTitle(page: Page): string {
  const titles: Record<Page, string> = {
    chat: "Chat",
    overview: "Overview",
    channels: "Channels",
    instances: "Instances",
    sessions: "Sessions",
    cron: "Cron Jobs",
    skills: "Skills",
    nodes: "Nodes",
    config: "Config",
    debug: "Debug",
    logs: "Logs",
    docs: "Docs",
  };
  return titles[page];
}

function NavGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-widest text-[#7d708d]">
        <span>{label}</span>
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function NavButton({
  page,
  current,
  onNavigate,
  icon,
  label,
}: {
  page: Page;
  current: Page;
  onNavigate: (page: Page) => void;
  icon: string;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onNavigate(page)}
      className={`nav-link ${current === page ? "active" : ""}`}
    >
      <span className="w-5 text-center text-sm leading-none text-purple-400">
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
}
