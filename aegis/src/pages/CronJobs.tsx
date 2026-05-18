import { useMemo, useState } from "react";
import type { CronTask } from "../types";

interface CronDraft {
  taskId?: string;
  title: string;
  prompt: string;
  cronExpression: string;
}

interface Props {
  tasks: CronTask[];
  onSave: (task: {
    taskId?: string;
    title: string;
    prompt: string;
    intervalMinutes: number;
    cronExpression: string;
  }) => void;
  onToggle: (taskId: string, enabled: boolean) => void;
  onDelete: (taskId: string) => void;
}

const DEFAULT_DRAFT: CronDraft = {
  title: "Daily system brief",
  prompt: "Review Parix health, recent errors, and pending setup items.",
  cronExpression: "0 * * * *",
};

export function CronJobs({ tasks, onSave, onToggle, onDelete }: Props) {
  const [draft, setDraft] = useState<CronDraft>(DEFAULT_DRAFT);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CronTask | null>(null);

  const validation = useMemo(
    () => validateCron(draft.cronExpression),
    [draft.cronExpression],
  );
  const enabledCount = tasks.filter((task) => task.enabled).length;

  function openCreate() {
    setDraft(DEFAULT_DRAFT);
    setModalOpen(true);
  }

  function openEdit(task: CronTask) {
    setDraft({
      taskId: task.taskId,
      title: task.title,
      prompt: task.prompt,
      cronExpression:
        task.cronExpression ?? intervalToCron(task.intervalMinutes),
    });
    setModalOpen(true);
  }

  function saveDraft() {
    if (!draft.title.trim() || !draft.prompt.trim() || !validation.valid)
      return;
    onSave({
      ...draft,
      title: draft.title.trim(),
      prompt: draft.prompt.trim(),
      intervalMinutes: validation.intervalMinutes,
    });
    setModalOpen(false);
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-sm text-[#a99bb9]">
            {tasks.length} scheduled task{tasks.length !== 1 ? "s" : ""},{" "}
            {enabledCount} enabled
          </div>
          <div className="mt-1 text-xs text-[#7d708d]">
            Cron syntax is stored as an interval today and can be promoted to
            full cron routing later.
          </div>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-xl border border-pink-300/30 bg-gradient-to-br from-pink-500 to-fuchsia-700 px-7 py-3 text-sm font-semibold text-white shadow-[0_0_30px_rgba(236,72,153,0.4)]"
        >
          Add Task
        </button>
      </section>

      <section className="grid gap-3">
        {tasks.length === 0 ? (
          <div className="card flex min-h-[260px] flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-purple-400/30 bg-purple-500/10 text-purple-200">
              +
            </div>
            <h2 className="text-lg font-semibold text-white">
              No cron tasks configured
            </h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-[#a99bb9]">
              Add a recurring brief, watcher, or cleanup routine and Parix will
              schedule it through Atrium.
            </p>
            <button
              type="button"
              onClick={openCreate}
              className="mt-5 rounded-xl border border-pink-300/30 bg-pink-500/15 px-5 py-2.5 text-sm font-semibold text-pink-100"
            >
              Create First Task
            </button>
          </div>
        ) : (
          tasks.map((task) => (
            <div
              key={task.taskId}
              className="card flex flex-wrap items-center justify-between gap-4"
            >
              <div className="min-w-[260px] flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="text-base font-semibold text-white">
                    {task.title}
                  </div>
                  <span className="rounded-full border border-purple-400/20 px-3 py-1 text-xs text-purple-200">
                    {task.cronExpression ??
                      intervalToCron(task.intervalMinutes)}
                  </span>
                </div>
                <div className="mt-1 text-sm text-[#a99bb9]">{task.prompt}</div>
                <div className="mt-2 text-xs text-purple-300">
                  Every {formatInterval(task.intervalMinutes)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onToggle(task.taskId, !task.enabled)}
                  className={`rounded-full px-4 py-2 text-sm ${
                    task.enabled
                      ? "bg-pink-500/20 text-pink-200"
                      : "bg-purple-500/10 text-[#a99bb9]"
                  }`}
                  aria-pressed={task.enabled}
                >
                  {task.enabled ? "Enabled" : "Paused"}
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(task)}
                  className="rounded-xl border border-purple-400/25 bg-[#100817] px-4 py-2 text-sm text-[#d8cceb]"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(task)}
                  className="rounded-xl border border-pink-400/25 bg-pink-500/10 px-4 py-2 text-sm text-pink-200"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </section>

      {modalOpen && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/65 px-4">
          <div className="w-full max-w-2xl rounded-lg border border-purple-400/25 bg-[#120a18] p-6 shadow-[0_0_60px_rgba(168,85,247,0.24)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  {draft.taskId ? "Edit Cron Task" : "Add Cron Task"}
                </h2>
                <p className="mt-1 text-sm text-[#a99bb9]">
                  Use five-field cron syntax such as */15 * * * *.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-full border border-purple-400/20 px-3 py-1 text-sm text-[#cfc3df]"
              >
                X
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <input
                value={draft.title}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                className="rounded-xl border border-purple-400/25 bg-[#0e0714] px-4 py-3 text-white outline-none focus:border-pink-400/60"
                placeholder="Task name"
              />
              <textarea
                value={draft.prompt}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    prompt: event.target.value,
                  }))
                }
                rows={3}
                className="resize-none rounded-xl border border-purple-400/25 bg-[#0e0714] px-4 py-3 text-white outline-none focus:border-pink-400/60"
                placeholder="What should Parix do?"
              />
              <label>
                <span className="text-sm font-medium text-[#cfc3df]">
                  Cron expression
                </span>
                <input
                  value={draft.cronExpression}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      cronExpression: event.target.value,
                    }))
                  }
                  className={`mt-2 w-full rounded-xl border bg-[#0e0714] px-4 py-3 font-mono text-white outline-none ${
                    validation.valid
                      ? "border-purple-400/25 focus:border-pink-400/60"
                      : "border-pink-400/60"
                  }`}
                  placeholder="0 * * * *"
                />
              </label>
              <div
                className={
                  validation.valid
                    ? "text-sm text-cyan-300"
                    : "text-sm text-pink-300"
                }
              >
                {validation.message}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-xl border border-purple-400/25 bg-[#100817] px-5 py-2.5 text-sm text-[#d8cceb]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveDraft}
                disabled={
                  !draft.title.trim() ||
                  !draft.prompt.trim() ||
                  !validation.valid
                }
                className="rounded-xl border border-pink-300/30 bg-gradient-to-br from-pink-500 to-fuchsia-700 px-6 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                Save Task
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/65 px-4">
          <div className="w-full max-w-md rounded-lg border border-pink-400/25 bg-[#120a18] p-6 shadow-[0_0_60px_rgba(236,72,153,0.2)]">
            <h2 className="text-xl font-semibold text-white">
              Delete cron task?
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#a99bb9]">
              {deleteTarget.title} will stop running immediately.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-xl border border-purple-400/25 bg-[#100817] px-5 py-2.5 text-sm text-[#d8cceb]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onDelete(deleteTarget.taskId);
                  setDeleteTarget(null);
                }}
                className="rounded-xl border border-pink-300/30 bg-pink-500/20 px-5 py-2.5 text-sm font-semibold text-pink-100"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function validateCron(expression: string): {
  valid: boolean;
  message: string;
  intervalMinutes: number;
} {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    return {
      valid: false,
      message: "Use five fields: minute hour day month weekday.",
      intervalMinutes: 60,
    };
  }

  const minute = parts[0];
  const hour = parts[1];
  const supported =
    /^(\*|\d{1,2}|\*\/\d{1,3})$/.test(minute) && /^(\*|\d{1,2})$/.test(hour);
  const restSupported = parts.slice(2).every((part) => part === "*");
  if (!supported || !restSupported) {
    return {
      valid: false,
      message:
        "This release supports hourly, every-N-minutes, or daily-at-hour schedules.",
      intervalMinutes: 60,
    };
  }

  let intervalMinutes = 60;
  if (minute.startsWith("*/")) intervalMinutes = Number(minute.slice(2));
  else if (minute === "*" && hour === "*") intervalMinutes = 1;
  else if (hour !== "*") intervalMinutes = 1440;

  if (
    !Number.isFinite(intervalMinutes) ||
    intervalMinutes < 1 ||
    intervalMinutes > 1440
  ) {
    return {
      valid: false,
      message: "Interval must resolve to 1-1440 minutes.",
      intervalMinutes: 60,
    };
  }

  return {
    valid: true,
    message: `Valid schedule, stored as every ${formatInterval(intervalMinutes)}.`,
    intervalMinutes,
  };
}

function intervalToCron(minutes: number): string {
  if (minutes < 60) return `*/${minutes} * * * *`;
  if (minutes === 60) return "0 * * * *";
  if (minutes === 1440) return "0 9 * * *";
  return `*/${Math.min(minutes, 59)} * * * *`;
}

function formatInterval(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}
