import { describe, expect, it } from "vitest";
import { constitution } from "../constitution.js";

const ctx = {
  reversibilityScore: 1,
  confidence: 1,
  handsStatus: "CONNECTED",
};

describe("constitution domain guardrails", () => {
  it("blocks destructive git cleanup", () => {
    const verdict = constitution.check(
      "cli",
      { command: "git clean -fd" },
      ctx,
    );

    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain("git clean");
  });

  it("blocks package publishing", () => {
    const verdict = constitution.check("cli", { command: "npm publish" }, ctx);

    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain("package registry");
  });

  it("blocks infrastructure mutation", () => {
    const verdict = constitution.check(
      "cli",
      { command: "terraform apply -auto-approve" },
      ctx,
    );

    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain("infrastructure");
  });

  it("allows low-risk local inspection", () => {
    const verdict = constitution.check(
      "cli",
      { command: "npm test -- --pool=forks" },
      ctx,
    );

    expect(verdict.allowed).toBe(true);
  });
});
