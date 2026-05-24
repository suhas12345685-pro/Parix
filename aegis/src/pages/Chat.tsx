import { useEffect, useRef, useState } from "react";
import type { AtriumState } from "../types";

interface ChatResponse {
  id: string;
  text: string;
}

interface Props {
  connected: boolean;
  state: AtriumState;
  paused: boolean;
  responses: ChatResponse[];
  onSend: (message: string) => void;
}

interface ChatMessage {
  id: number | string;
  role: "atrium" | "operator";
  text: string;
}

export function Chat({ connected, state, paused, responses, onSend }: Props) {
  const [draft, setDraft] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const seenResponseIdsRef = useRef<Set<string>>(new Set());
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      role: "atrium",
      text: "Atrium is standing by. Ask for a fix, a system readout, or a quick explanation of the last action.",
    },
  ]);

  useEffect(() => {
    const freshResponses = responses.filter(
      (response) => !seenResponseIdsRef.current.has(response.id),
    );
    if (freshResponses.length === 0) return;

    for (const response of freshResponses) {
      seenResponseIdsRef.current.add(response.id);
    }

    // Filter out intermediate ack messages from display
    const realResponses = freshResponses.filter(
      (r) => !r.id.startsWith("chat-ack-")
    );

    if (realResponses.length > 0) {
      setMessages((prev) => [
        ...prev,
        ...realResponses.map((response) => ({
          id: `atrium-${response.id}`,
          role: "atrium" as const,
          text: response.text,
        })),
      ]);
      setIsThinking(false);
    }
  }, [responses]);

  function submit() {
    const text = draft.trim();
    if (!text) return;
    setMessages((prev) => [
      ...prev,
      { id: Date.now(), role: "operator", text },
    ]);
    setIsThinking(true);
    onSend(text);
    setDraft("");
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto pr-2">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 mb-2">
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
              className={`flex items-start gap-4 rounded-xl border px-5 py-4 text-sm leading-6 shadow-sm transition-all duration-200 ${
                message.role === "operator"
                  ? "ml-auto max-w-[85%] border-[var(--border-accent)] bg-[var(--bg-bubble-self)] text-[var(--text-primary)]"
                  : "mr-auto max-w-[85%] border-[var(--border-primary)] bg-[var(--bg-bubble-agent)] text-[var(--text-primary)]"
              }`}
            >
              <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-[var(--border-primary)] bg-[var(--bg-surface)] text-lg ${
                message.role === "operator" ? "text-[var(--accent-color)]" : "text-[var(--text-secondary)]"
              }`}>
                {message.role === "operator" ? "✦" : "◇"}
              </span>
              <span className="whitespace-pre-line pt-1.5 flex-1">{message.text}</span>
            </div>
          ))}

          {isThinking && (
            <div className="mr-auto max-w-[85%] flex items-start gap-4 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-bubble-agent)] px-5 py-4 text-sm leading-6 shadow-sm">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-[var(--border-primary)] bg-[var(--bg-surface)] text-lg text-[var(--accent-color)] animate-spin">
                ◇
              </span>
              <div className="flex items-center gap-1.5 pt-3.5">
                <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--accent-color)]" style={{ animationDelay: "0ms" }} />
                <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--accent-color)]" style={{ animationDelay: "150ms" }} />
                <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--accent-color)]" style={{ animationDelay: "300ms" }} />
                <span className="ml-2 text-xs text-[var(--text-secondary)] font-medium animate-pulse">Atrium is thinking...</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-4xl border-t border-[var(--border-primary)] pt-4 mt-2">
        <div className="flex gap-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-chat-input-outer)] p-2">
          <label className="flex flex-1 items-center gap-3 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-chat-input)] px-3 py-2">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-[var(--border-primary)] bg-[var(--bg-surface)] text-base text-[var(--accent-color)]">
              ✦
            </span>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              rows={1}
              placeholder="Message Atrium (Enter to send, Shift+Enter for new line)"
              className="min-h-6 flex-1 resize-none bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)]"
            />
          </label>
          <button
            type="button"
            onClick={submit}
            className="flex items-center gap-2 rounded-lg border border-[var(--border-accent)] bg-[var(--accent-gradient)] px-5 text-sm font-semibold text-white shadow-[0_0_24px_var(--glow-shadow)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!draft.trim() || isThinking}
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
      "border-[var(--border-accent)] bg-[var(--bg-bubble-self)] text-[var(--accent-color)] shadow-[inset_0_0_15px_var(--glow-shadow)]",
    ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 dark:text-emerald-300",
    alert: "border-rose-500/30 bg-rose-500/10 text-rose-500 dark:text-rose-400",
    muted: "border-[var(--border-primary)] bg-[var(--bg-surface)]/60 text-[var(--text-secondary)]",
  }[tone];

  return (
    <span
      className={`rounded-md border px-3 py-1 text-xs font-medium transition-all duration-200 ${toneClass}`}
    >
      {label}
    </span>
  );
}
