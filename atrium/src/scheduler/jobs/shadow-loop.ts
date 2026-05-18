import { registerJob } from "../index.js";
import { snapshot } from "../../intelligence/watchdog.js";

export function registerShadowLoopJob(intervalMs = 60_000): string {
  return registerJob("shadow-loop-snapshot", intervalMs, () => snapshot());
}
