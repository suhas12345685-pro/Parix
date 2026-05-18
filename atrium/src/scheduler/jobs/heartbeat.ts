import { registerJob } from "../index.js";
import {
  cleanExpiredSuppressions,
  decayFocus,
  resetStats,
} from "../../cognition/attention.js";

let ticks = 0;

export function registerHeartbeatJob(sendHeartbeat: () => void): string {
  return registerJob("heartbeat", 30_000, () => {
    decayFocus();
    cleanExpiredSuppressions();

    ticks += 1;
    if (ticks % 10 === 0) {
      resetStats();
    }

    sendHeartbeat();
  });
}
