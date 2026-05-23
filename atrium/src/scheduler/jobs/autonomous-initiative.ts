/**
 * Autonomous initiative job.
 *
 * Periodically gives Parix a chance to act on its own. It only fires when the
 * agent is idle and not paused, and only pursues a goal the cognition layer has
 * already inferred with high confidence — it never invents busywork. When the
 * user has opted into autonomous mode it executes the plan through the engine
 * (so constitution/governor/reversibility gates still apply); otherwise it
 * surfaces a low-urgency suggestion instead of acting.
 */
import { registerJob } from "../index.js";
import { isPaused } from "../../intelligence/pause.js";
import { getLastCognitiveSnapshot } from "../../cognition/index.js";
import { isAutonomousMode } from "../../config/profile.js";
import { runAutonomous } from "../../cognition/autonomous/creative-agent.js";
import type { Executor } from "../../cognition/autonomous/types.js";
import { dispatch as notify } from "../../intelligence/notify.js";

interface InitiativeEngine {
  getState(): string;
  runUserRequest(text: string): Promise<unknown>;
}

const GOAL_CONFIDENCE_FLOOR = 0.7;
const DEFAULT_INTERVAL_MS = 900_000; // 15 min

// Guards against overlapping runs dispatching duplicate real actions when a run
// takes longer than the job interval.
let running = false;

export function registerAutonomousInitiativeJob(
  engine: InitiativeEngine,
  intervalMs = DEFAULT_INTERVAL_MS,
): string {
  return registerJob("autonomous-initiative", intervalMs, async () => {
    if (running) return;
    if (isPaused()) return;
    if (engine.getState() !== "IDLE") return;

    const snapshot = getLastCognitiveSnapshot();
    const desire = snapshot?.decision?.desire;
    if (
      !desire?.inferredGoal ||
      typeof desire.confidence !== "number" ||
      !Number.isFinite(desire.confidence) ||
      desire.confidence < GOAL_CONFIDENCE_FLOOR
    ) {
      // No confident goal — stay quiet rather than invent work.
      return;
    }

    running = true;
    try {
      const acting = isAutonomousMode();
      const run = await runAutonomous(
        {
          goal: desire.inferredGoal,
          context: desire.userNeed,
          autonomyLevel: acting ? "autonomous" : "assist",
        },
        acting ? { executor: makeActingExecutor(engine) } : {},
      );

      if (acting && run.status === "completed") {
        console.log(
          `[INITIATIVE] Acted on "${desire.inferredGoal}": ${run.result.summary}`,
        );
        return;
      }

      // Not acting (or escalated) — propose the idea instead of doing it.
      const idea = run.result.chosenIdea?.description;
      await notify({
        title: "Parix has an idea",
        body: idea
          ? `For "${desire.inferredGoal}": ${idea}`
          : `I drafted an approach for "${desire.inferredGoal}". Say the word and I'll run it.`,
        urgency: "low",
      });
    } finally {
      running = false;
    }
  });
}

/**
 * Executor that turns the autonomous plan into real engine actions. Each
 * non-prep plan step is dispatched as a user request, so it passes through the
 * constitution, governor, and reversibility checks like any other action.
 */
function makeActingExecutor(engine: InitiativeEngine): Executor {
  return async (plan, _idea, brief) => {
    const artifacts: string[] = [];
    for (const node of plan.nodes) {
      if (node.taskType === "silent_prep") continue;
      try {
        await engine.runUserRequest(node.goal);
        artifacts.push(`ran:${node.id}`);
      } catch (err) {
        artifacts.push(`failed:${node.id}`);
        console.error(
          `[INITIATIVE] step "${node.goal}" failed:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
    return {
      summary: `Autonomously executed ${artifacts.filter((a) => a.startsWith("ran:")).length} step(s) for "${brief.goal}".`,
      artifacts,
    };
  };
}
