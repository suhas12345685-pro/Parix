import { getDb } from "../memory/db.js";

export interface ScheduledJob {
  id: string;
  name: string;
  intervalMs: number;
  handler: () => void | Promise<void>;
  enabled: boolean;
  lastRunAt: number;
  nextRunAt: number;
  runCount: number;
}

const jobs = new Map<string, ScheduledJob>();
const timers = new Map<string, ReturnType<typeof setInterval>>();
let started = false;

export function registerJob(
  name: string,
  intervalMs: number,
  handler: () => void | Promise<void>,
  enabled = true,
): string {
  const id = `job_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
  const now = Date.now();
  jobs.set(id, {
    id,
    name,
    intervalMs,
    handler,
    enabled,
    lastRunAt: 0,
    nextRunAt: now + intervalMs,
    runCount: 0,
  });
  if (started && enabled) startJobTimer(id);
  return id;
}

export function enableJob(id: string): void {
  const job = jobs.get(id);
  if (!job) return;
  job.enabled = true;
  if (started) startJobTimer(id);
}

export function disableJob(id: string): void {
  const job = jobs.get(id);
  if (!job) return;
  job.enabled = false;
  stopJobTimer(id);
}

export function removeJob(id: string): void {
  stopJobTimer(id);
  jobs.delete(id);
}

export function getJobs(): ScheduledJob[] {
  return Array.from(jobs.values());
}

export function startScheduler(): void {
  if (started) return;
  started = true;
  for (const [id, job] of jobs) {
    if (job.enabled) startJobTimer(id);
  }
  loadCronTasks();
  console.log(`[SCHEDULER] Started with ${jobs.size} jobs`);
}

export function stopScheduler(): void {
  started = false;
  for (const id of timers.keys()) stopJobTimer(id);
  console.log("[SCHEDULER] Stopped");
}

function startJobTimer(id: string): void {
  stopJobTimer(id);
  const job = jobs.get(id);
  if (!job) return;
  timers.set(
    id,
    setInterval(async () => {
      if (!job.enabled) return;
      job.lastRunAt = Date.now();
      job.runCount++;
      job.nextRunAt = job.lastRunAt + job.intervalMs;
      try {
        await job.handler();
      } catch (err) {
        console.error(
          `[SCHEDULER] Job ${job.name} failed:`,
          err instanceof Error ? err.message : err,
        );
      }
    }, job.intervalMs),
  );
}

function stopJobTimer(id: string): void {
  const timer = timers.get(id);
  if (timer) {
    clearInterval(timer);
    timers.delete(id);
  }
}

function loadCronTasks(): void {
  try {
    const stmt = getDb().prepare(
      "SELECT task_id, title, prompt, interval_minutes, enabled FROM cron_tasks WHERE enabled = 1",
    );
    while (stmt.step()) {
      const [taskId, title, _prompt, intervalMinutes] = stmt.get();
      const id = `cron_${taskId}`;
      if (!jobs.has(id)) {
        registerJob(
          String(title),
          Number(intervalMinutes) * 60_000,
          () => console.log(`[SCHEDULER:CRON] Running: ${title}`),
          true,
        );
      }
    }
    stmt.free();
  } catch {
    // cron_tasks table may not exist yet
  }
}
