import { useState } from "react";
import type { AtriumState } from "../types";

interface Props {
  connected: boolean;
  state: AtriumState;
  paused: boolean;
  onSend: (message: string) => void;
}

interface ChatMessage {
  id: number;
  role: "atrium" | "operator";
  text: string;
}

export function Chat({ connected, state, paused, onSend }: Props) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      role: "atrium",
      text: "Atrium is standing by. Ask for a fix, a system readout, or a quick explanation of the last action.",
    },
  ]);

  function submit() {
    const text = draft.trim();
    if (!text) return;
    setMessages((prev) => [
      ...prev,
      { id: Date.now(), role: "operator", text },
    ]);
    onSend(text);
    setDraft("");
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill
              label={paused ? "Paused" : state}
              tone={paused ? "muted" : "active"}
            />
            <StatusPill
              label={connected ? "Synapse connected" : "Synapse offline"}
              tone={connected ? "ok" : "alert"}
            />
            <StatusPill label="Parix Atrium Dashboard" tone="muted" />
          </div>

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex items-start gap-4 rounded-xl border px-5 py-4 text-sm leading-6 shadow-[0_0_20px_rgba(168,85,247,0.08)] ${
                message.role === "operator"
                  ? "ml-auto max-w-[85%] border-pink-400/25 bg-pink-500/8 text-white"
                  : "border-purple-400/20 bg-[#151020]/70 text-white"
              }`}
            >
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-purple-400/30 bg-purple-500/10 text-lg text-purple-400">
                {message.role === "operator" ? "✦" : "◇"}
              </span>
              <span className="pt-1.5">{message.text}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto w-full max-w-4xl border-t border-purple-400/10 pt-4">
        <div className="flex gap-2 rounded-xl border border-purple-400/20 bg-[#130a1a]/70 p-2">
          <label className="flex flex-1 items-center gap-3 rounded-lg border border-purple-400/15 bg-[#0e0814] px-3 py-2">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-purple-400/20 bg-purple-500/10 text-base text-purple-300">
              ✦
            </span>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  submit();
                }
              }}
              rows={1}
              placeholder="Message Atrium (Ctrl+Enter to send)"
              className="min-h-6 flex-1 resize-none bg-transparent text-sm text-white outline-none placeholder:text-[#7d708d]"
            />
          </label>
          <button
            type="button"
            onClick={submit}
            className="flex items-center gap-2 rounded-lg border border-pink-300/25 bg-gradient-to-br from-pink-500 to-fuchsia-700 px-5 text-sm font-semibold text-white shadow-[0_0_24px_rgba(236,72,153,0.4)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!draft.trim()}
          >
            <span className="text-base">↗</span>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "active" | "ok" | "alert" | "muted";
}) {
  const toneClass = {
    active:
      "border-violet-400/70 bg-violet-500/12 text-violet-300 shadow-[inset_0_0_20px_rgba(139,92,246,0.12)]",
    ok: "border-cyan-400/45 bg-cyan-400/10 text-cyan-300",
    alert: "border-pink-500/45 bg-pink-500/12 text-pink-400",
    muted: "border-purple-400/25 bg-purple-500/10 text-[#cdbfe1]",
  }[tone];

  return (
    <span
      className={`rounded-md border px-3 py-1 text-xs font-medium ${toneClass}`}
    >
      {label}
    </span>
  );
}
