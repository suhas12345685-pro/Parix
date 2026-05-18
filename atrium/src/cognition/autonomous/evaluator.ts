import type {
  CreativeBrief,
  CreativeCritique,
  CreativeIdea,
} from "./types.js";

const WEIGHTS = {
  novelty: 0.25,
  feasibility: 0.3,
  alignment: 0.35,
  risk: 0.1,
};

export function scoreIdea(idea: CreativeIdea, brief: CreativeBrief): number {
  const criteriaBonus = matchesSuccessCriteria(idea, brief) * 0.05;
  const raw =
    idea.novelty * WEIGHTS.novelty +
    idea.feasibility * WEIGHTS.feasibility +
    idea.alignment * WEIGHTS.alignment +
    (1 - idea.risk) * WEIGHTS.risk +
    criteriaBonus;
  return Math.max(0, Math.min(1, Number(raw.toFixed(3))));
}

export function critique(
  idea: CreativeIdea,
  brief: CreativeBrief,
): CreativeCritique {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const refinements: string[] = [];

  if (idea.novelty >= 0.7) strengths.push("strong divergent novelty");
  else if (idea.novelty < 0.4)
    weaknesses.push("idea may feel derivative or expected");

  if (idea.feasibility >= 0.7) strengths.push("clearly feasible with current means");
  else if (idea.feasibility < 0.5) {
    weaknesses.push("feasibility looks shaky");
    refinements.push("scope down to a minimal demonstrable slice");
  }

  if (idea.alignment >= 0.7) strengths.push("tracks the brief's stated intent");
  else if (idea.alignment < 0.55) {
    weaknesses.push("drifts from the brief's stated goal");
    refinements.push(`re-anchor on: ${brief.goal}`);
  }

  if (idea.risk >= 0.5) {
    weaknesses.push("carries notable downside risk");
    refinements.push("design a reversible first step to de-risk");
  }

  for (const constraint of brief.constraints ?? []) {
    if (!idea.description.toLowerCase().includes(constraint.toLowerCase())) {
      refinements.push(`explicitly satisfy constraint: ${constraint}`);
    }
  }

  return {
    ideaId: idea.id,
    score: scoreIdea(idea, brief),
    strengths,
    weaknesses,
    refinements,
  };
}

export function pickBest(
  ideas: CreativeIdea[],
  brief: CreativeBrief,
): { idea: CreativeIdea; critique: CreativeCritique; score: number } | null {
  if (ideas.length === 0) return null;
  let best: {
    idea: CreativeIdea;
    critique: CreativeCritique;
    score: number;
  } | null = null;
  for (const idea of ideas) {
    const c = critique(idea, brief);
    if (!best || c.score > best.score) {
      best = { idea, critique: c, score: c.score };
    }
  }
  return best;
}

function matchesSuccessCriteria(
  idea: CreativeIdea,
  brief: CreativeBrief,
): number {
  const criteria = brief.successCriteria ?? [];
  if (criteria.length === 0) return 0;
  const text = `${idea.description} ${idea.rationale}`.toLowerCase();
  const hit = criteria.filter((c) =>
    c
      .toLowerCase()
      .split(/\W+/)
      .filter(Boolean)
      .some((tok) => text.includes(tok)),
  ).length;
  return hit / criteria.length;
}
