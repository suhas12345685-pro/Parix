import type { GoalTreeSnapshot } from "../types";
import { EmptyState } from "./EmptyState";

interface Props {
  plan: GoalTreeSnapshot | null;
}

const statusTone: Record<string, string> = {
  pending: "border-zinc-500 bg-transparent",
  active: "border-cyan-300 bg-cyan-300",
  done: "border-emerald-300 bg-emerald-300",
  failed: "border-rose-300 bg-rose-300",
  skipped: "border-amber-300 bg-amber-300",
};

export function PlanProgress({ plan }: Props) {
  if (!plan) {
    return (
      <section className="rounded-lg border border-purple-400/15 bg-[#120b18]/70 p-4">
        <div className="text-xs uppercase tracking-wide text-[#8f82a0]">
          Plan Progress
        </div>
        <div className="mt-3">
          <EmptyState title="No active goal tree" />
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-purple-400/15 bg-[#120b18]/70 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-[#8f82a0]">
            Plan Progress
          </div>
          <h3 className="mt-1 truncate text-sm font-semibold text-white">
            {plan.rootGoal}
          </h3>
        </div>
        <span className="rounded-md border border-cyan-300/20 bg-cyan-400/10 px-2 py-1 text-xs text-cyan-200">
          {plan.status}
        </span>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#24162f]">
        <div
          className="h-full rounded-full bg-cyan-300"
          style={{ width: `${plan.progress.percent}%` }}
        />
      </div>
      <div className="mt-2 text-xs text-[#a99bb9]">
        {plan.progress.done + plan.progress.skipped}/{plan.progress.total} steps
        complete
      </div>

      <div className="mt-4 space-y-2">
        {plan.nodes.slice(0, 6).map((node) => (
          <div
            key={node.id}
            className="flex items-center gap-3 rounded-md bg-[#0b0710] px-3 py-2"
          >
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full border ${statusTone[node.status] ?? statusTone.pending}`}
              role="img"
              aria-label={`${node.status} step`}
              title={node.status}
            />
            <span className="min-w-0 flex-1 truncate text-sm text-[#e8def3]">
              {node.goal}
            </span>
            {node.retries > 0 && (
              <span className="text-xs text-amber-200">
                {node.retries}/{node.maxRetries}
              </span>
            )}
          </div>
        ))}
      </div>

      {plan.status === "suspended" && (
        <div className="mt-3 rounded-md border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
          Repair needed before the next step can run.
        </div>
      )}
    </section>
  );
}
