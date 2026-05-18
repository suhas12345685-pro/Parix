import { v4 as uuid } from "uuid";
import { advance, decompose, nextExecutable } from "../planner/index.js";
import type { GoalTree, PlanNode } from "../planner/types.js";
import type {
  DesireInference,
  Hypothesis,
  WorldFact,
} from "../types.js";
import { critique, pickBest } from "./evaluator.js";
import { defaultIdeator } from "./ideator.js";
import type {
  AutonomousOptions,
  AutonomousRun,
  CreativeBrief,
  CreativeIdea,
  CreativeIteration,
  Executor,
} from "./types.js";

const DEFAULTS = {
  maxIterations: 3,
  acceptThreshold: 0.7,
  autonomyLevel: "autonomous" as const,
};

export async function runAutonomous(
  brief: CreativeBrief,
  options: AutonomousOptions = {},
): Promise<AutonomousRun> {
  const ideator = options.ideator ?? defaultIdeator;
  const executor = options.executor ?? defaultExecutor;
  const now = options.now ?? Date.now;

  const maxIterations = brief.maxIterations ?? DEFAULTS.maxIterations;
  const acceptThreshold = brief.acceptThreshold ?? DEFAULTS.acceptThreshold;
  const autonomyLevel = brief.autonomyLevel ?? DEFAULTS.autonomyLevel;

  const run: AutonomousRun = {
    id: uuid(),
    brief,
    iterations: [],
    plan: null,
    result: { summary: "", chosenIdea: null, artifacts: [], score: 0 },
    status: "running",
    startedAt: now(),
  };

  const allIdeas: CreativeIdea[] = [];
  let bestSoFar: {
    idea: CreativeIdea;
    score: number;
    refinements: string[];
  } | null = null;

  for (let i = 0; i < maxIterations; i++) {
    const fresh = await ideator(brief, i, allIdeas);
    if (fresh.length === 0) break;
    allIdeas.push(...fresh);

    const critiques = fresh.map((idea) => critique(idea, brief));
    const best = pickBest(fresh, brief);
    if (!best) break;

    const iteration: CreativeIteration = {
      index: i,
      ideas: fresh,
      critiques,
      chosen: best.idea,
      chosenScore: best.score,
      refinements: best.critique.refinements,
    };
    run.iterations.push(iteration);

    if (!bestSoFar || best.score > bestSoFar.score) {
      bestSoFar = {
        idea: best.idea,
        score: best.score,
        refinements: best.critique.refinements,
      };
    }

    if (best.score >= acceptThreshold) break;
  }

  if (!bestSoFar) {
    run.status = "failed";
    run.escalationReason = "no viable ideas were generated";
    run.finishedAt = now();
    return run;
  }

  if (autonomyLevel !== "autonomous" && bestSoFar.score < acceptThreshold) {
    run.status = "awaiting_user";
    run.escalationReason = `top idea scored ${bestSoFar.score} under threshold ${acceptThreshold}`;
    run.result = {
      summary: `Drafted ${allIdeas.length} ideas across ${run.iterations.length} iterations; needs your call.`,
      chosenIdea: bestSoFar.idea,
      artifacts: [],
      score: bestSoFar.score,
    };
    run.finishedAt = now();
    return run;
  }

  const plan = buildPlan(brief, bestSoFar.idea, bestSoFar.refinements);
  run.plan = plan;

  try {
    const execution = await executor(plan, bestSoFar.idea, brief);
    markPlanComplete(plan);
    run.result = {
      summary: execution.summary,
      chosenIdea: bestSoFar.idea,
      artifacts: execution.artifacts,
      score: bestSoFar.score,
    };
    run.status = "completed";
  } catch (err) {
    run.status = "failed";
    run.escalationReason =
      err instanceof Error ? err.message : "executor raised a non-Error value";
    run.result = {
      summary: "Execution failed before producing artifacts.",
      chosenIdea: bestSoFar.idea,
      artifacts: [],
      score: bestSoFar.score,
    };
  }

  run.finishedAt = now();
  return run;
}

function buildPlan(
  brief: CreativeBrief,
  idea: CreativeIdea,
  refinements: string[],
): GoalTree {
  const desire: DesireInference = {
    inferredGoal: brief.goal,
    userNeed: brief.context ?? brief.goal,
    evidence: [`sensor:autonomous_creative_agent`, `idea:${idea.id}`],
    confidence: idea.alignment,
    suggestedHelp: buildPhases(idea, refinements),
    silentPrep: ["gather references", "lay out workspace"],
    interrupt: false,
  };

  const hypotheses: Hypothesis[] = [
    {
      id: idea.id,
      explanation: idea.description,
      evidence: [idea.rationale],
      confidence: Math.max(idea.alignment, idea.feasibility),
      missingEvidence: refinements,
    },
  ];

  const worldFacts: WorldFact[] = (brief.constraints ?? []).map((c) => ({
    key: "constraint",
    value: c,
    confidence: 1,
    evidence: ["brief"],
  }));

  return decompose(desire, hypotheses, worldFacts);
}

function buildPhases(idea: CreativeIdea, refinements: string[]): string[] {
  const phases = [
    `draft a first pass of: ${idea.description}`,
    `self-review against constraints and success criteria`,
    `produce a polished deliverable`,
  ];
  if (refinements.length > 0) {
    phases.splice(1, 0, `incorporate refinements: ${refinements.join("; ")}`);
  }
  return phases;
}

function markPlanComplete(plan: GoalTree): void {
  let safety = plan.nodes.length * 4 + 8;
  while (plan.status === "active" && safety-- > 0) {
    const runnable: PlanNode[] = nextExecutable(plan);
    if (runnable.length === 0) break;
    for (const node of runnable) {
      advance(plan, node.id, true, `auto-advanced by autonomous agent`);
    }
  }
}

const defaultExecutor: Executor = (plan, idea, brief) => {
  const steps = plan.nodes
    .filter((n) => n.taskType !== "silent_prep")
    .map((n) => `- ${n.goal}`)
    .join("\n");
  const summary =
    `Autonomous run delivered "${idea.description}" for goal "${brief.goal}".\n` +
    `Plan executed (${plan.nodes.length} nodes):\n${steps}`;
  return {
    summary,
    artifacts: [`idea:${idea.id}`, `plan:${plan.id}`],
  };
};
