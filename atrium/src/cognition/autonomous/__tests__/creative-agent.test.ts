import { afterEach, describe, expect, it } from "vitest";
import {
  critique,
  defaultIdeator,
  pickBest,
  runAutonomous,
  scoreIdea,
} from "../index.js";
import type {
  CreativeBrief,
  CreativeIdea,
  Executor,
  Ideator,
} from "../index.js";
import { getAllActiveTrees, removeTree } from "../../planner/index.js";

afterEach(() => {
  for (const tree of getAllActiveTrees()) {
    removeTree(tree.id);
  }
});

const baseBrief: CreativeBrief = {
  goal: "design a calm landing page for a meditation app",
  context: "soft colors, single CTA",
  constraints: ["accessible", "monochrome"],
  successCriteria: ["calm", "single CTA"],
  domain: "design",
};

describe("scoring and critique", () => {
  it("scoreIdea bounds output to [0,1]", () => {
    const idea: CreativeIdea = {
      id: "x",
      description: "calm hero with single CTA",
      rationale: "matches brief",
      novelty: 1,
      feasibility: 1,
      alignment: 1,
      risk: 0,
      tags: [],
    };
    const score = scoreIdea(idea, baseBrief);
    expect(score).toBeGreaterThan(0.9);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("critique flags missing constraints as refinements", () => {
    const idea: CreativeIdea = {
      id: "y",
      description: "wild gradient explosion hero",
      rationale: "high-energy",
      novelty: 0.9,
      feasibility: 0.6,
      alignment: 0.4,
      risk: 0.6,
      tags: [],
    };
    const c = critique(idea, baseBrief);
    expect(c.refinements.some((r) => r.includes("monochrome"))).toBe(true);
    expect(c.weaknesses.length).toBeGreaterThan(0);
  });

  it("pickBest returns null on empty input and the highest score otherwise", () => {
    expect(pickBest([], baseBrief)).toBeNull();
    const ideas: CreativeIdea[] = [
      {
        id: "a",
        description: "a",
        rationale: "r",
        novelty: 0.1,
        feasibility: 0.1,
        alignment: 0.1,
        risk: 0.9,
        tags: [],
      },
      {
        id: "b",
        description: "b",
        rationale: "r",
        novelty: 0.9,
        feasibility: 0.9,
        alignment: 0.9,
        risk: 0.1,
        tags: [],
      },
    ];
    expect(pickBest(ideas, baseBrief)?.idea.id).toBe("b");
  });
});

describe("defaultIdeator", () => {
  it("produces diverse, unique ideas across iterations", async () => {
    const a = await defaultIdeator(baseBrief, 0, []);
    const b = await defaultIdeator(baseBrief, 1, a);
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    const allDescriptions = new Set([...a, ...b].map((i) => i.description));
    expect(allDescriptions.size).toBe(a.length + b.length);
  });
});

describe("runAutonomous", () => {
  it("completes a high-confidence brief without supervision", async () => {
    const ideator: Ideator = () => [
      {
        id: "good",
        description: "calm minimal hero with single CTA and monochrome accessible palette",
        rationale: "tracks every constraint",
        novelty: 0.7,
        feasibility: 0.9,
        alignment: 0.95,
        risk: 0.1,
        tags: ["design"],
      },
    ];
    const run = await runAutonomous(baseBrief, { ideator });
    expect(run.status).toBe("completed");
    expect(run.result.chosenIdea?.id).toBe("good");
    expect(run.plan).not.toBeNull();
    expect(run.plan?.status).toBe("completed");
    expect(run.result.artifacts.length).toBeGreaterThan(0);
  });

  it("iterates up to maxIterations when ideas are weak", async () => {
    let calls = 0;
    const ideator: Ideator = () => {
      calls += 1;
      return [
        {
          id: `weak-${calls}`,
          description: `weak idea ${calls}`,
          rationale: "thin",
          novelty: 0.2,
          feasibility: 0.3,
          alignment: 0.3,
          risk: 0.6,
          tags: [],
        },
      ];
    };
    const run = await runAutonomous(
      { ...baseBrief, maxIterations: 2, acceptThreshold: 0.99 },
      { ideator },
    );
    expect(calls).toBe(2);
    expect(run.iterations).toHaveLength(2);
  });

  it("escalates under non-autonomous level when score is below threshold", async () => {
    const ideator: Ideator = () => [
      {
        id: "mid",
        description: "mediocre idea",
        rationale: "ok",
        novelty: 0.4,
        feasibility: 0.4,
        alignment: 0.4,
        risk: 0.5,
        tags: [],
      },
    ];
    const run = await runAutonomous(
      { ...baseBrief, autonomyLevel: "assist", acceptThreshold: 0.9 },
      { ideator },
    );
    expect(run.status).toBe("awaiting_user");
    expect(run.escalationReason).toBeDefined();
    expect(run.plan).toBeNull();
  });

  it("fails cleanly when the ideator yields nothing", async () => {
    const ideator: Ideator = () => [];
    const run = await runAutonomous(baseBrief, { ideator });
    expect(run.status).toBe("failed");
    expect(run.escalationReason).toContain("no viable ideas");
  });

  it("captures executor errors as failure with escalation reason", async () => {
    const ideator: Ideator = () => [
      {
        id: "good",
        description: "calm minimal hero",
        rationale: "ok",
        novelty: 0.7,
        feasibility: 0.9,
        alignment: 0.9,
        risk: 0.1,
        tags: [],
      },
    ];
    const executor: Executor = () => {
      throw new Error("renderer offline");
    };
    const run = await runAutonomous(baseBrief, { ideator, executor });
    expect(run.status).toBe("failed");
    expect(run.escalationReason).toBe("renderer offline");
    expect(run.result.chosenIdea?.id).toBe("good");
  });
});
