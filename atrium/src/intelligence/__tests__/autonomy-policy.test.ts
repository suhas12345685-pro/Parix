import { describe, expect, it } from "vitest";
import {
  describeAutonomyLevel,
  evaluateAutonomy,
} from "../autonomy-policy.js";

describe("autonomy policy", () => {
  it("requires near-trivial reversibility in ask-before-fix mode", () => {
    const verdict = evaluateAutonomy("ask-before-fix", {
      reversibilityScore: 0.89,
      confidence: 1,
    });

    expect(verdict?.allowed).toBe(false);
    expect(verdict?.reason).toContain("hard floor");
  });

  it("allows safe-auto-fix actions above the cautious band", () => {
    const verdict = evaluateAutonomy("safe-auto-fix", {
      reversibilityScore: 0.82,
      confidence: 0.7,
    });

    expect(verdict).toBeNull();
  });

  it("requires high confidence for medium-reversibility safe-auto-fix actions", () => {
    const lowConfidence = evaluateAutonomy("safe-auto-fix", {
      reversibilityScore: 0.65,
      confidence: 0.8,
    });
    const highConfidence = evaluateAutonomy("safe-auto-fix", {
      reversibilityScore: 0.65,
      confidence: 0.88,
    });

    expect(lowConfidence?.allowed).toBe(false);
    expect(highConfidence).toBeNull();
  });

  it("still enforces a hard floor in full-auto mode", () => {
    const verdict = evaluateAutonomy("full-auto", {
      reversibilityScore: 0.1,
      confidence: 1,
    });

    expect(verdict?.allowed).toBe(false);
  });

  it("requires very high confidence for low-reversibility full-auto actions", () => {
    const lowConfidence = evaluateAutonomy("full-auto", {
      reversibilityScore: 0.4,
      confidence: 0.9,
    });
    const highConfidence = evaluateAutonomy("full-auto", {
      reversibilityScore: 0.4,
      confidence: 0.96,
    });

    expect(lowConfidence?.allowed).toBe(false);
    expect(highConfidence).toBeNull();
  });

  it("falls back unknown levels to safe-auto-fix", () => {
    expect(describeAutonomyLevel("surprise-mode")).toContain(
      "level=safe-auto-fix",
    );
  });
});
