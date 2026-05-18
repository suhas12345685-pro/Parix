import { describe, expect, it } from "vitest";
import { formatExplanation } from "../explainability.js";
import type { ActionExplanation } from "../explainability.js";

describe("formatExplanation", () => {
  it("formats the action explanation sections", () => {
    const explanation: ActionExplanation = {
      taskId: "task-1",
      what: "Ran command: npm install",
      why: "A terminal error was detected in your command output",
      when: "May 15, 2026, 10:30 AM",
      safety: "Constitution check passed",
      outcome: "success",
      chain: [],
    };

    const formatted = formatExplanation(explanation);

    expect(formatted).toContain("Action: Ran command: npm install");
    expect(formatted).toContain(
      "Why: A terminal error was detected in your command output",
    );
    expect(formatted).toContain("When: May 15, 2026, 10:30 AM");
    expect(formatted).toContain("Safety: Constitution check passed");
    expect(formatted).toContain("Outcome: success");
  });
});
