/**
 * Scheduler bootstrap.
 *
 * The scheduler subsystem (heartbeat, maintenance jobs, and user cron tasks)
 * was defined but never started. This wires the engine in for cron execution,
 * registers the standing jobs, and starts the scheduler so time-based
 * proactiveness actually runs.
 */
import { startScheduler, setSchedulerEngine } from "./index.js";
import { registerHeartbeatJob } from "./jobs/heartbeat.js";
import { registerEventCleanupJob } from "./jobs/event-cleanup.js";
import { registerStorageSyncJob } from "./jobs/storage-sync.js";
import { registerTokenBudgetJob } from "./jobs/token-budget.js";
import { registerWorldStateSnapshotJob } from "./jobs/world-state-snapshot.js";
import { registerAutonomousInitiativeJob } from "./jobs/autonomous-initiative.js";

interface CronEngine {
  getState(): string;
  runUserRequest(text: string): Promise<unknown>;
}

export function bootstrapScheduler(
  engine: CronEngine,
  opts: { sendHeartbeat?: () => void } = {},
): void {
  setSchedulerEngine(engine);

  registerHeartbeatJob(opts.sendHeartbeat ?? (() => {}));
  registerEventCleanupJob();
  registerStorageSyncJob();
  registerTokenBudgetJob();
  registerWorldStateSnapshotJob();
  registerAutonomousInitiativeJob(engine);

  // startScheduler() also loads enabled cron tasks from the DB and begins
  // firing them through engine.runUserRequest().
  startScheduler();
}
