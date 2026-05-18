import { registerJob } from "../index.js";
import { snapshot } from "../../intelligence/watchdog.js";

export function registerWorldStateSnapshotJob(intervalMs = 120_000): string {
  return registerJob("world-state-snapshot", intervalMs, () => snapshot());
}
