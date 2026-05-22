import { useEffect, useState } from "react";
import type { SystemHealth } from "../types";

interface FirstRunBootProps {
  connected: boolean;
  reconnecting: boolean;
  reconnectAttempt: number;
  lastError: string | null;
  lastMessageAt: number | null;
  health: SystemHealth;
  eventsSeen: number;
}

type StepStatus = "pending" | "active" | "done" | "error";

interface Step {
  key: string;
  label: string;
  description: string;
  status: StepStatus;
}

const AUTO_DISMISS_AFTER_READY_MS = 1500;

export function FirstRunBoot(props: FirstRunBootProps) {
  const {
    connected,
    reconnecting,
    reconnectAttempt,
    lastError,
    lastMessageAt,
    eventsSeen,
  } = props;

  const [dismissed, setDismissed] = useState(false);
  const steps = buildSteps(props);
  const allDone = steps.every((s) => s.status === "done");

  useEffect(() => {
    if (!allDone || dismissed) return;
    const t = window.setTimeout(
      () => setDismissed(true),
      AUTO_DISMISS_AFTER_READY_MS,
    );
    return () => window.clearTimeout(t);
  }, [allDone, dismissed]);

  if (dismissed) return null;

  const doneCount = steps.filter((s) => s.status === "done").length;
  const percent = Math.round((doneCount / steps.length) * 100);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#07040c]/95 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-fuchsia-400/20 bg-[#0e0814] p-8 shadow-[0_0_60px_rgba(168,85,247,0.18)]">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-pink-500 to-fuchsia-700 text-base font-bold text-white">
            P
          </span>
          <div>
            <h2 className="text-base font-semibold text-white">
              Parix is starting up
            </h2>
            <p className="text-xs text-[#9d91ad]">
              Aegis is waiting for the runtime to come online.
            </p>
          </div>
        </div>

        <div className="mb-5">
          <div className="mb-2 flex items-center justify-between text-xs text-[#a99bb9]">
            <span>{doneCount === steps.length ? "Ready" : "Connecting"}</span>
            <span className="tabular-nums">{percent}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[#1a0f24]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-purple-500 transition-all duration-500 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        <ol className="space-y-3">
          {steps.map((step) => (
            <li
              key={step.key}
              className="flex items-start gap-3 text-sm"
              data-testid={`first-run-step-${step.key}`}
            >
              <StepIcon status={step.status} />
              <div className="min-w-0 flex-1">
                <div
                  className={`font-medium ${
                    step.status === "done"
                      ? "text-white"
                      : step.status === "active"
                        ? "text-fuchsia-200"
                        : step.status === "error"
                          ? "text-rose-300"
                          : "text-[#7a6f8b]"
                  }`}
                >
                  {step.label}
                </div>
                <div className="mt-0.5 text-xs leading-5 text-[#9d91ad]">
                  {step.description}
                </div>
              </div>
            </li>
          ))}
        </ol>

        {(reconnecting || lastError) && (
          <div className="mt-5 rounded-lg border border-pink-400/20 bg-pink-500/8 px-3 py-2 text-xs text-pink-200">
            {lastError ??
              `Reconnecting${reconnectAttempt ? ` (attempt #${reconnectAttempt})` : ""}…`}
          </div>
        )}

        <div className="mt-6 flex items-center justify-between text-xs text-[#7a6f8b]">
          <div>
            {connected
              ? `Relay live · ${eventsSeen} event${eventsSeen === 1 ? "" : "s"} seen`
              : "Relay offline"}
          </div>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="rounded-md border border-purple-400/20 px-3 py-1 text-[#c9bdd8] transition hover:bg-purple-500/10 hover:text-white"
          >
            {allDone ? "Enter dashboard" : "Skip to dashboard"}
          </button>
        </div>

        {!connected && !reconnecting && (
          <p className="mt-3 text-[10px] leading-4 text-[#7a6f8b]">
            If this hangs, run `parix start` from a terminal and reload — the
            atrium daemon must be running for Aegis to connect.
          </p>
        )}

        <p className="sr-only" aria-live="polite">
          {lastMessageAt
            ? `Last message received at ${new Date(lastMessageAt).toLocaleTimeString()}`
            : "Waiting for first message from relay"}
        </p>
      </div>
    </div>
  );
}

function buildSteps(props: FirstRunBootProps): Step[] {
  const { connected, lastMessageAt, health, eventsSeen } = props;
  const handsConnected =
    health.dashboard.handsStatus?.toUpperCase() === "CONNECTED";
  const sawHealthSnapshot = lastMessageAt !== null;

  return [
    {
      key: "relay",
      label: "Aegis relay",
      description: connected
        ? "Live WebSocket to atrium."
        : "Opening a WebSocket on port 8766.",
      status: connected ? "done" : "active",
    },
    {
      key: "atrium",
      label: "Atrium",
      description: sawHealthSnapshot
        ? "Cognition daemon is reporting health."
        : "Waiting for the first HEALTH_SNAPSHOT.",
      status: !connected ? "pending" : sawHealthSnapshot ? "done" : "active",
    },
    {
      key: "hands",
      label: "Hands",
      description: handsConnected
        ? "Executor process attached."
        : "Atrium has not yet reached the hands process.",
      status: !sawHealthSnapshot
        ? "pending"
        : handsConnected
          ? "done"
          : "active",
    },
    {
      key: "sensors",
      label: "Sensors",
      description:
        eventsSeen > 0
          ? `Receiving sensor events (${eventsSeen} so far).`
          : "Watching for the first sensor or accessibility event.",
      status: !handsConnected
        ? "pending"
        : eventsSeen > 0
          ? "done"
          : "active",
    },
  ];
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "done") {
    return (
      <span
        className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-300"
        aria-hidden
      >
        ✓
      </span>
    );
  }
  if (status === "active") {
    return (
      <span
        className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 border-fuchsia-400/40 border-t-fuchsia-300"
        aria-hidden
      >
        <span className="block h-2 w-2 animate-spin rounded-full border border-fuchsia-300 border-t-transparent" />
      </span>
    );
  }
  if (status === "error") {
    return (
      <span
        className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-rose-400/20 text-rose-300"
        aria-hidden
      >
        !
      </span>
    );
  }
  return (
    <span
      className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-[#3a2d4a] text-[#7a6f8b]"
      aria-hidden
    >
      ○
    </span>
  );
}
