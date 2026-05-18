import { afterEach, describe, expect, it } from "vitest";
import {
  checkCoherence,
  getAllNarratives,
  getStaleNarratives,
  hasBeenTried,
  recordAttempt,
  resolveNarrative,
  startNarrative,
} from "../horizon.js";
import type { CandidateAction } from "../types.js";

const touchedNarratives = new Set<string>();

describe("horizon coherence", () => {
  afterEach(() => {
    for (const id of touchedNarratives) {
      resolveNarrative(id, "abandoned");
    }
    touchedNarratives.clear();
  });

  it("startNarrative() creates a new active entry", () => {
    const narrative = track(
      startNarrative(uniqueGoal("debug module imports"), "terminal_error"),
    );

    expect(narrative.id).toBeTruthy();
    expect(narrative.goal).toContain("debug module imports");
    expect(narrative.status).toBe("active");
    expect(narrative.attempts).toEqual([]);
    expect(narrative.summary).toContain("Started");
  });

  it("startNarrative() returns an existing similar active narrative", () => {
    const goal = uniqueGoal("fix auth redirect loop");
    const first = track(startNarrative(goal, "terminal_error"));
    const second = track(startNarrative(`${goal} again`, "app_crash"));

    expect(second.id).toBe(first.id);
    expect(second.trigger).toBe("terminal_error");
    expect(second.lastActivityAt).toBeGreaterThanOrEqual(first.lastActivityAt);
  });

  it("recordAttempt() with success auto-resolves", () => {
    const narrative = track(
      startNarrative(uniqueGoal("restore local dev server"), "terminal_error"),
    );

    recordAttempt(narrative.id, {
      approach: "cli:npm run dev",
      outcome: "success",
      timestamp: Date.now(),
      lessonLearned: "server recovered after dependency install",
    });

    const stored = getAllNarratives().find((item) => item.id === narrative.id);
    expect(stored?.status).toBe("succeeded");
    expect(stored?.summary).toContain("1 ok");
  });

  it("recordAttempt() with 3 failures marks a narrative blocked", () => {
    const narrative = track(
      startNarrative(
        uniqueGoal("restart postgres container"),
        "container_unhealthy",
      ),
    );

    for (let i = 0; i < 3; i++) {
      recordAttempt(narrative.id, {
        approach: "cli:docker restart postgres",
        outcome: "failure",
        timestamp: Date.now() + i,
        lessonLearned: `postgres crashed on boot ${i + 1}`,
      });
    }

    const stored = getAllNarratives().find((item) => item.id === narrative.id);
    expect(stored?.status).toBe("blocked");
    expect(stored?.blockedReason).toContain("Failed 3 consecutive times");
    expect(stored?.blockedReason).toContain("postgres crashed on boot 3");
  });

  it("checkCoherence() detects destructive conflicts", () => {
    const narrative = track(
      startNarrative(uniqueGoal("protect postgres database"), "user_goal"),
    );
    const action = makeAction({
      payload: { action: `${narrative.goal} delete postgres database` },
      reversibility: 0.2,
    });

    const check = checkCoherence(action, [narrative]);

    expect(check.isCoherent).toBe(false);
    expect(check.conflicts[0]).toContain(narrative.goal);
  });

  it("hasBeenTried() finds similar past approaches", () => {
    const goal = uniqueGoal("recover api server");
    const narrative = track(startNarrative(goal, "terminal_error"));
    recordAttempt(narrative.id, {
      approach: "cli:restart api server with clean env",
      outcome: "failure",
      timestamp: Date.now(),
      lessonLearned: "restart did not clear the missing secret",
    });

    const prior = hasBeenTried("cli:restart api server after env change", goal);

    expect(prior).not.toBeNull();
    expect(prior?.outcome).toBe("failure");
    expect(prior?.lessonLearned).toContain("missing secret");
  });

  it("getStaleNarratives() returns active narratives older than 24 hours", () => {
    const narrative = track(
      startNarrative(uniqueGoal("finish release checklist"), "user_goal"),
    );
    narrative.lastActivityAt = Date.now() - 25 * 60 * 60 * 1000;

    expect(getStaleNarratives().map((item) => item.id)).toContain(narrative.id);
  });
});

function track<T extends { id: string }>(narrative: T): T {
  touchedNarratives.add(narrative.id);
  return narrative;
}

function uniqueGoal(goal: string): string {
  return `${goal} ${Math.random().toString(36).slice(2, 8)}`;
}

function makeAction(overrides: Partial<CandidateAction> = {}): CandidateAction {
  return {
    id: "action-" + Math.random().toString(36).slice(2, 8),
    taskType: "cli",
    payload: {},
    reason: "unit test action",
    reversibility: 0.8,
    ...overrides,
  };
}
