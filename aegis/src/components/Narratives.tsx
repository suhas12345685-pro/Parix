import { useState } from "react";
import type { NarrativeSnapshot } from "../types";
import { EmptyState } from "./EmptyState";

interface Props {
  narratives: NarrativeSnapshot[];
}

export function Narratives({ narratives }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <section className="rounded-lg border border-purple-400/15 bg-[#120b18]/70 p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-[#8f82a0]">
          Narratives
        </div>
        <span className="text-xs text-[#b8aec5]">
          {narratives.length} active
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {narratives.length === 0 && (
          <EmptyState title="No active long-horizon work" />
        )}

        {narratives.map((narrative) => {
          const stale =
            Date.now() - narrative.lastActivityAt > 24 * 60 * 60 * 1000;
          const isOpen = expanded === narrative.id;

          return (
            <div key={narrative.id} className="rounded-md bg-[#0b0710]">
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : narrative.id)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-white">
                  {narrative.goal}
                </span>
                <span className="rounded-md border border-purple-300/15 px-2 py-0.5 text-xs text-[#cdbfe0]">
                  {narrative.attemptCount} tries
                </span>
                {narrative.failureStreak > 0 && (
                  <span className="rounded-md bg-rose-400/10 px-2 py-0.5 text-xs text-rose-200">
                    {narrative.failureStreak} fails
                  </span>
                )}
                {stale && <span className="text-xs text-amber-200">Stale</span>}
              </button>

              {isOpen && (
                <div className="border-t border-purple-400/10 px-3 py-3">
                  <p className="text-xs leading-5 text-[#b8aec5]">
                    {narrative.summary}
                  </p>
                  <div className="mt-3 space-y-2">
                    {narrative.attempts.slice(-4).map((attempt) => (
                      <div
                        key={`${attempt.timestamp}-${attempt.approach}`}
                        className="text-xs text-[#d8cde6]"
                      >
                        <span className="font-medium text-cyan-200">
                          {attempt.outcome}
                        </span>
                        <span> - {attempt.approach}</span>
                        {attempt.lessonLearned && (
                          <div className="text-[#9d91ad]">
                            {attempt.lessonLearned}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
