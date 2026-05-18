import { useEffect, useMemo, useState } from "react";
import type { ChannelSnapshot } from "../types";

interface Props {
  channels: ChannelSnapshot[];
  onSave: (enabled: string[], wakeWord: string) => void;
}

const OPTIONAL_CHANNELS = [
  { id: "desktop", label: "Desktop" },
  { id: "telegram", label: "Telegram" },
  { id: "webhook", label: "Webhook" },
  { id: "discord", label: "Discord" },
  { id: "slack", label: "Slack" },
  { id: "microsoft-teams", label: "Microsoft Teams" },
  { id: "google-chat", label: "Google Chat" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "signal", label: "Signal" },
  { id: "matrix", label: "Matrix" },
  { id: "voice-call", label: "Voice Call" },
];

export function Channels({ channels, onSave }: Props) {
  const enabledFromServer = useMemo(
    () =>
      new Set(
        channels
          .filter((channel) => channel.enabled)
          .map((channel) => channel.id),
      ),
    [channels],
  );
  const aegis = channels.find((channel) => channel.id === "aegis");
  const serverWakeWord = String(aegis?.config?.wakeWord ?? "aegis");

  const [enabled, setEnabled] = useState<string[]>([]);
  const [wakeWord, setWakeWord] = useState(serverWakeWord);

  useEffect(() => {
    setEnabled(
      OPTIONAL_CHANNELS.filter((channel) =>
        enabledFromServer.has(channel.id),
      ).map((channel) => channel.id),
    );
    setWakeWord(serverWakeWord);
  }, [enabledFromServer, serverWakeWord]);

  function toggle(channelId: string) {
    setEnabled((current) =>
      current.includes(channelId)
        ? current.filter((id) => id !== channelId)
        : [...current, channelId],
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-[1.1fr_1.4fr]">
        <section className="card">
          <div className="text-sm font-medium text-[#9d91ad]">
            Default channel
          </div>
          <div className="mt-4 rounded-2xl border border-pink-400/35 bg-pink-500/10 p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  Aegis Voice
                </h2>
                <p className="mt-1 text-sm leading-6 text-[#b9aec8]">
                  Always enabled. Aegis only listens after the selected wake
                  word.
                </p>
              </div>
              <span className="rounded-full border border-pink-400/35 bg-pink-500/10 px-4 py-2 text-sm font-medium text-pink-300">
                Default
              </span>
            </div>
            <label className="mt-5 block">
              <span className="text-sm font-medium text-[#cfc3df]">
                Wake word
              </span>
              <input
                value={wakeWord}
                onChange={(event) =>
                  setWakeWord(event.target.value.trimStart().toLowerCase())
                }
                className="mt-2 w-full rounded-xl border border-purple-400/25 bg-[#0e0714] px-4 py-3 text-white outline-none placeholder:text-[#786a89] focus:border-pink-400/60"
                placeholder="aegis"
              />
            </label>
          </div>
        </section>

        <section className="card">
          <div className="text-sm font-medium text-[#9d91ad]">
            Additional channels
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {OPTIONAL_CHANNELS.map((channel) => {
              const selected = enabled.includes(channel.id);
              return (
                <button
                  key={channel.id}
                  type="button"
                  onClick={() => toggle(channel.id)}
                  className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
                    selected
                      ? "border-pink-400/50 bg-pink-500/15 text-white"
                      : "border-purple-400/20 bg-[#0f0815] text-[#cfc3df] hover:bg-purple-500/10"
                  }`}
                >
                  <span>{channel.label}</span>
                  <span
                    className={`h-3 w-3 rounded-full ${selected ? "bg-pink-400 shadow-[0_0_14px_rgba(236,72,153,0.8)]" : "bg-[#4c3d5b]"}`}
                  />
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => onSave(["aegis", ...enabled], wakeWord || "aegis")}
          className="rounded-xl border border-pink-300/30 bg-gradient-to-br from-pink-500 to-fuchsia-700 px-7 py-3 text-sm font-semibold text-white shadow-[0_0_30px_rgba(236,72,153,0.4)] transition hover:brightness-110"
        >
          Save Channels
        </button>
      </div>
    </div>
  );
}
