import { v4 as uuid } from "uuid";
import type { CreativeBrief, CreativeIdea, Ideator } from "./types.js";

const DIVERGENT_LENSES = [
  { tag: "minimal", angle: "strip to the smallest viable form" },
  { tag: "maximal", angle: "lean into the most ambitious interpretation" },
  { tag: "inverted", angle: "invert the obvious approach" },
  { tag: "remix", angle: "borrow a pattern from an unrelated domain" },
  { tag: "constraint-driven", angle: "make a hard constraint the centerpiece" },
  { tag: "speculative", angle: "assume future capability and design for it" },
];

export const defaultIdeator: Ideator = (brief, iteration, prior) => {
  const seen = new Set(prior.map((p) => p.description.toLowerCase()));
  const lenses = pickLenses(iteration, DIVERGENT_LENSES);

  return lenses
    .map((lens) => synthesize(brief, lens, iteration))
    .filter((idea) => {
      const key = idea.description.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

function pickLenses<T>(iteration: number, lenses: T[]): T[] {
  const offset = iteration % lenses.length;
  const rotated = [...lenses.slice(offset), ...lenses.slice(0, offset)];
  return rotated.slice(0, 4);
}

function synthesize(
  brief: CreativeBrief,
  lens: { tag: string; angle: string },
  iteration: number,
): CreativeIdea {
  const constraints = brief.constraints ?? [];
  const constraintBlurb = constraints.length
    ? ` honoring ${constraints.slice(0, 2).join(" and ")}`
    : "";
  const description = `${capitalize(lens.angle)} for "${brief.goal}"${constraintBlurb}.`;
  const rationale = `Lens "${lens.tag}" applied on iteration ${iteration + 1}; ${lens.angle}.`;

  const novelty = bound(0.55 + lens.tag.length * 0.01 + iteration * 0.05);
  const feasibility = bound(
    lens.tag === "speculative" ? 0.45 : 0.75 - iteration * 0.04,
  );
  const alignment = bound(
    0.6 + countMatchingTokens(lens.angle, brief.goal) * 0.08,
  );
  const risk = bound(
    lens.tag === "speculative" || lens.tag === "maximal" ? 0.55 : 0.3,
  );

  return {
    id: uuid(),
    description,
    rationale,
    novelty,
    feasibility,
    alignment,
    risk,
    tags: [lens.tag, ...(brief.domain ? [brief.domain] : [])],
  };
}

function bound(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(3))));
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

function countMatchingTokens(a: string, b: string): number {
  const tokens = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
  return a
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t && tokens.has(t)).length;
}
