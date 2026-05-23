import { useState, useCallback } from "react";
import { useParixSocket } from "./hooks/useParixSocket";
import { Sidebar } from "./components/Sidebar";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Chat } from "./pages/Chat";
import { Canvas } from "./pages/Canvas";
import { Channels } from "./pages/Channels";
import { CronJobs } from "./pages/CronJobs";
import { Dashboard } from "./pages/Dashboard";
import { Skills } from "./pages/Skills";
import { AuditTrail } from "./pages/AuditTrail";
import { Settings } from "./pages/Settings";
import { Workspace } from "./pages/Workspace";
import { Instances } from "./pages/Instances";
import { Sessions } from "./pages/Sessions";
import { Nodes } from "./pages/Nodes";
import { Debug } from "./pages/Debug";
import { FirstRunBoot } from "./components/FirstRunBoot";
import { NowPanel } from "./components/NowPanel";

export type Page =
  | "chat"
  | "canvas"
  | "overview"
  | "channels"
  | "instances"
  | "sessions"
  | "cron"
  | "skills"
  | "nodes"
  | "config"
  | "debug"
  | "logs"
  | "docs";

type WindowState = "normal" | "minimized" | "maximized";

export function App() {
  const [page, setPage] = useState<Page>("chat");
  const [windowState, setWindowState] = useState<WindowState>("maximized");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const socket = useParixSocket();
  const title = pageTitle(page);
  const subtitle = pageSubtitle(page);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
      setWindowState("normal");
    } else {
      document.documentElement.requestFullscreen();
      setWindowState("maximized");
    }
  }, []);

  if (windowState === "minimized") {
    return (
      <div className="fixed bottom-6 left-6 z-50">
        <button
          type="button"
          onClick={() => setWindowState("normal")}
          className="flex items-center gap-3 rounded-2xl border border-pink-400/30 bg-[#120a18] px-6 py-4 text-white shadow-[0_0_40px_rgba(236,72,153,0.3)] transition hover:bg-[#1a0f24]"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-pink-500 to-fuchsia-700 text-sm font-bold">
            P
          </span>
          <span className="font-semibold">Parix Aegis</span>
          <span
            className={`ml-2 h-2 w-2 rounded-full ${socket.connected ? "bg-cyan-400" : "bg-pink-500"}`}
          />
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#07040c] text-[#f8f2ff]">
      <FirstRunBoot
        connected={socket.connected}
        reconnecting={socket.reconnecting}
        reconnectAttempt={socket.reconnectAttempt}
        lastError={socket.lastError}
        lastMessageAt={socket.lastMessageAt}
        health={socket.health}
        eventsSeen={socket.events.length}
      />
      <div className="flex h-full w-full bg-[radial-gradient(circle_at_12%_8%,rgba(236,72,153,0.12),transparent_30%),radial-gradient(circle_at_85%_15%,rgba(124,58,237,0.08),transparent_36%),linear-gradient(145deg,#0c0612_0%,#08050e_50%,#0a0710_100%)]">
        <Sidebar
          page={page}
          onNavigate={setPage}
          connected={socket.connected}
          state={socket.health.dashboard.atriumState}
          paused={socket.health.dashboard.paused}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
        />

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-fuchsia-400/10 bg-[#0e0814]/80 px-6">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setSidebarCollapsed((c) => !c)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#9d91ad] transition hover:bg-purple-500/10 hover:text-white"
                title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {sidebarCollapsed ? "☰" : "◁"}
              </button>
              <div>
                <h1 className="text-lg font-semibold leading-5 text-white">
                  {title}
                </h1>
                <p className="text-xs text-[#9d91ad]">{subtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden items-center gap-2 rounded-lg border border-purple-400/20 bg-[#170e20]/60 px-3 py-1.5 text-xs text-[#c9bdd8] md:flex">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    socket.connected
                      ? "bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]"
                      : "bg-pink-500 shadow-[0_0_10px_rgba(236,72,153,0.8)]"
                  }`}
                />
                {socket.connected ? "Connected" : "Offline"}
              </div>
              {!socket.connected && socket.reconnecting && (
                <div className="hidden rounded-lg border border-pink-400/20 bg-pink-500/8 px-3 py-1.5 text-xs text-pink-200 lg:block">
                  Reconnecting
                  {socket.reconnectAttempt
                    ? ` #${socket.reconnectAttempt}`
                    : ""}
                </div>
              )}

              <div className="ml-4 flex items-center gap-1 border-l border-purple-400/15 pl-4">
                <button
                  type="button"
                  onClick={() => setWindowState("minimized")}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-sm text-[#9d91ad] transition hover:bg-purple-500/15 hover:text-white"
                  title="Minimize"
                >
                  ─
                </button>
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-sm text-[#9d91ad] transition hover:bg-purple-500/15 hover:text-white"
                  title="Fullscreen"
                >
                  {windowState === "maximized" ? "❐" : "□"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm("Close Aegis dashboard?"))
                      window.close();
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-sm text-[#9d91ad] transition hover:bg-pink-500/20 hover:text-pink-300"
                  title="Close"
                >
                  ✕
                </button>
              </div>
            </div>
          </header>

          <section className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {!socket.connected && (
              <div className="mb-4 flex items-center gap-3 rounded-lg border border-purple-400/15 bg-[#130b1b]/60 px-4 py-2.5 text-xs text-[#b8aec5]">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-purple-300/30 border-t-cyan-300" />
                <span>
                  {socket.lastError ??
                    "Waiting for the Aegis relay. Cached dashboard data remains visible."}
                </span>
              </div>
            )}
            <ErrorBoundary page={page}>
              {page === "chat" && (
                <Chat
                  connected={socket.connected}
                  state={socket.health.dashboard.atriumState}
                  paused={socket.health.dashboard.paused}
                  responses={socket.chatResponses}
                  onSend={(message) => socket.sendCommand("chat", { message })}
                />
              )}
              {page === "canvas" && <Canvas canvas={socket.health.canvas} />}
              {page === "overview" && (
                <Dashboard
                  health={socket.health}
                  events={socket.events}
                  connected={socket.connected}
                  lastMessageAt={socket.lastMessageAt}
                />
              )}
              {page === "channels" && (
                <Channels
                  channels={socket.health.channels}
                  onSave={(enabled, wakeWord) =>
                    socket.sendCommand("save_channels", { enabled, wakeWord })
                  }
                />
              )}
              {page === "cron" && (
                <CronJobs
                  tasks={socket.health.cronTasks}
                  onSave={(task) => socket.sendCommand("save_cron_task", task)}
                  onToggle={(taskId, enabled) =>
                    socket.sendCommand("toggle_cron_task", { taskId, enabled })
                  }
                  onDelete={(taskId) =>
                    socket.sendCommand("delete_cron_task", { taskId })
                  }
                />
              )}
              {page === "skills" && (
                <Skills
                  skills={socket.health.installedSkills}
                  onCreate={(skill) =>
                    socket.sendCommand("create_skill", skill)
                  }
                />
              )}
              {page === "docs" && (
                <Workspace
                  files={socket.health.workspaceFiles}
                  onInit={() => socket.sendCommand("init_workspace_files")}
                />
              )}
              {page === "logs" && (
                <AuditTrail
                  entries={socket.audit}
                  onExplain={(taskId) =>
                    socket.sendCommand("explain", { taskId })
                  }
                />
              )}
              {page === "config" && (
                <Settings
                  health={socket.health}
                  onPause={() => socket.sendCommand("pause")}
                  onResume={() => socket.sendCommand("resume")}
                  onFlush={() => socket.sendCommand("flush")}
                />
              )}
              {page === "instances" && (
                <Instances
                  health={socket.health}
                  connected={socket.connected}
                />
              )}
              {page === "sessions" && (
                <Sessions events={socket.events} audit={socket.audit} />
              )}
              {page === "nodes" && (
                <Nodes health={socket.health} connected={socket.connected} />
              )}
              {page === "debug" && (
                <Debug
                  health={socket.health}
                  events={socket.events}
                  connected={socket.connected}
                  onSendCommand={socket.sendCommand}
                />
              )}
              {isPlaceholderPage(page) && (
                <div className="flex h-full items-center justify-center">
                  <div className="max-w-md text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-purple-400/25 bg-purple-500/10 text-purple-300 shadow-[0_0_26px_rgba(168,85,247,0.24)]">
                      {placeholderIcon(page)}
                    </div>
                    <h2 className="text-lg font-semibold text-white">
                      {title}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-[#a99bb9]">
                      Hatchery can mount this Parix module as soon as the
                      backing service is wired in.
                    </p>
                  </div>
                </div>
              )}
            </ErrorBoundary>
          </section>
          <NowPanel
            health={socket.health}
            events={socket.events}
            connected={socket.connected}
          />
        </main>
      </div>
    </div>
  );
}

function pageTitle(page: Page): string {
  const titles: Record<Page, string> = {
    chat: "Chat",
    canvas: "Canvas",
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

function pageSubtitle(page: Page): string {
  const subtitles: Record<Page, string> = {
    chat: "Direct Atrium session for quick interventions.",
    canvas: "Live document the agent writes and updates.",
    overview: "Live health, state, and event telemetry.",
    channels: "Outbound user notification routes.",
    instances: "Running Parix processes and bridges.",
    sessions: "Recent agent work sessions.",
    cron: "Scheduled watchers and shadow loops.",
    skills: "Installed Parix skills and routing hints.",
    nodes: "Connected Hands executors and devices.",
    config: "Runtime controls and governor settings.",
    debug: "Developer diagnostics and probes.",
    logs: "Tamper-evident Atrium audit trail.",
    docs: "Operator references and runbooks.",
  };
  return subtitles[page];
}

function isPlaceholderPage(_page: Page): boolean {
  return false;
}

function placeholderIcon(page: Page): string {
  const icons: Partial<Record<Page, string>> = {
    channels: "up",
    instances: "box",
    sessions: "clock",
    cron: "loop",
    skills: "star",
    nodes: "node",
    debug: "gear",
    docs: "doc",
  };
  return icons[page] ?? "dot";
}
