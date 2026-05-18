import { useState } from "react";
import type { SystemHealth, SensorEvent } from "../types";

interface Props {
  health: SystemHealth;
  events: SensorEvent[];
  connected: boolean;
  onSendCommand: (command: string, payload?: Record<string, unknown>) => void;
}

export function Debug({ health, events, connected, onSendCommand }: Props) {
  const { dashboard, governor, skills, dlq } = health;
  const [testEventType, setTestEventType] = useState("terminal_error");
  const [testPayload, setTestPayload] = useState(
    '{"error":"test","output":"Error: TEST_DEBUG"}',
  );

  function sendTestEvent() {
    try {
      const data = JSON.parse(testPayload);
      onSendCommand("inject_test_event", { eventType: testEventType, data });
    } catch {
      // invalid JSON
    }
  }

  return (
    <div className="space-y-5">
      {/* Connection Status */}
      <section className="card">
        <h2 className="text-base font-semibold text-white">
          Connection Diagnostics
        </h2>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <DiagItem
            label="WebSocket"
            value={connected ? "Connected" : "Disconnected"}
            ok={connected}
          />
          <DiagItem
            label="Hands Bridge"
            value={dashboard.handsStatus}
            ok={dashboard.handsStatus === "CONNECTED"}
          />
          <DiagItem
            label="Engine State"
            value={dashboard.paused ? "PAUSED" : dashboard.atriumState}
            ok={dashboard.atriumState !== "ERROR"}
          />
          <DiagItem
            label="Queue"
            value={`${dashboard.queueDepth} pending`}
            ok={dashboard.queueDepth < 10}
          />
        </div>
      </section>

      {/* Governor Stats */}
      <section className="card">
        <h2 className="text-base font-semibold text-white">
          Governor Diagnostics
        </h2>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <DiagItem
            label="Per Minute"
            value={`${governor.minuteCount} / 5`}
            ok={governor.minuteCount < 5}
          />
          <DiagItem
            label="Per Hour"
            value={`${governor.hourCount} / 60`}
            ok={governor.hourCount < 60}
          />
          <DiagItem
            label="Daily Tokens"
            value={`${(governor.dailyTokens / 1000).toFixed(1)}k / ${(governor.dailyLimit / 1000).toFixed(0)}k`}
            ok={governor.dailyTokens < governor.dailyLimit * 0.8}
          />
          <DiagItem
            label="Skill Hit Rate"
            value={`${(skills.hitRate * 100).toFixed(0)}%`}
            ok={skills.hitRate > 0.5}
          />
        </div>
      </section>

      {/* Dead Letter Queue */}
      <section className="card">
        <h2 className="text-base font-semibold text-white">
          Dead Letter Queue
        </h2>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
          <DiagItem
            label="Pending"
            value={String(dlq.pending)}
            ok={dlq.pending === 0}
          />
          <DiagItem
            label="Exhausted"
            value={String(dlq.exhausted)}
            ok={dlq.exhausted === 0}
          />
          <DiagItem
            label="Skills Cached"
            value={String(skills.totalPatterns)}
            ok={skills.totalPatterns > 0}
          />
        </div>
      </section>

      {/* Test Event Injection */}
      <section className="card">
        <h2 className="text-base font-semibold text-white">
          Event Injection (Debug)
        </h2>
        <p className="mt-1 text-sm text-[#a99bb9]">
          Send a synthetic sensor event through the pipeline.
        </p>
        <div className="mt-4 grid gap-3">
          <div className="grid gap-3 md:grid-cols-2">
            <select
              value={testEventType}
              onChange={(e) => setTestEventType(e.target.value)}
              className="rounded-xl border border-purple-400/25 bg-[#0e0714] px-4 py-3 text-white outline-none focus:border-pink-400/60"
            >
              <option value="terminal_error">terminal_error</option>
              <option value="disk_low">disk_low</option>
              <option value="cpu_high">cpu_high</option>
              <option value="memory_high">memory_high</option>
              <option value="battery_low">battery_low</option>
            </select>
            <button
              type="button"
              onClick={sendTestEvent}
              className="rounded-xl border border-pink-300/30 bg-gradient-to-br from-pink-500 to-fuchsia-700 px-7 py-3 text-sm font-semibold text-white shadow-[0_0_30px_rgba(236,72,153,0.4)]"
            >
              Inject Event
            </button>
          </div>
          <textarea
            value={testPayload}
            onChange={(e) => setTestPayload(e.target.value)}
            rows={3}
            className="resize-none rounded-xl border border-purple-400/25 bg-[#0e0714] px-4 py-3 font-mono text-sm text-white outline-none focus:border-pink-400/60"
            placeholder="JSON payload"
          />
        </div>
      </section>

      {/* Recent Events Raw */}
      <section className="card">
        <h2 className="text-base font-semibold text-white">
          Raw Event Buffer ({events.length})
        </h2>
        <div className="mt-3 max-h-64 overflow-y-auto">
          {events.length === 0 ? (
            <div className="text-sm text-[#7d708d]">No events in buffer.</div>
          ) : (
            <pre className="font-mono text-xs text-[#b8aec5]">
              {events
                .slice(0, 10)
                .map((ev) => JSON.stringify(ev, null, 0))
                .join("\n")}
            </pre>
          )}
        </div>
      </section>
    </div>
  );
}

function DiagItem({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="rounded-xl border border-purple-400/15 bg-[#0f0815]/60 px-4 py-3">
      <div className="text-xs text-[#7d708d]">{label}</div>
      <div className="mt-1 flex items-center gap-2">
        <span
          className={`h-2 w-2 rounded-full ${ok ? "bg-cyan-400" : "bg-pink-500"}`}
        />
        <span className="font-mono text-sm text-white">{value}</span>
      </div>
    </div>
  );
}
