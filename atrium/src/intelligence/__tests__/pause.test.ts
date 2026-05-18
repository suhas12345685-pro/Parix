import { afterEach, describe, expect, it, vi } from "vitest";

describe("pause switch", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.resetModules();
    vi.doUnmock("../audit.js");
  });

  it("starts unpaused", async () => {
    const { pauseSwitch } = await loadPauseSwitch();

    expect(pauseSwitch.isPaused()).toBe(false);
    expect(pauseSwitch.getStatus()).toEqual({
      paused: false,
      pausedAt: null,
      pausedBy: null,
      pausedForMs: null,
    });
  });

  it("pauses and records status", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const { audit, pauseSwitch } = await loadPauseSwitch();

    pauseSwitch.pause("manual");

    expect(pauseSwitch.isPaused()).toBe(true);
    expect(pauseSwitch.getStatus()).toEqual({
      paused: true,
      pausedAt: 1_000,
      pausedBy: "manual",
      pausedForMs: 0,
    });
    expect(audit).toHaveBeenCalledWith({
      actor: "user",
      action: "pause",
      payload: { reason: "manual" },
    });
  });

  it("resumes and clears pause status", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const { audit, pauseSwitch } = await loadPauseSwitch();
    pauseSwitch.pause("manual");

    vi.setSystemTime(2_500);
    pauseSwitch.resume();

    expect(pauseSwitch.isPaused()).toBe(false);
    expect(pauseSwitch.getStatus()).toEqual({
      paused: false,
      pausedAt: null,
      pausedBy: null,
      pausedForMs: null,
    });
    expect(audit).toHaveBeenLastCalledWith({
      actor: "user",
      action: "resume",
      payload: { paused_for_ms: 1_500, was_paused_by: "manual" },
    });
  });

  it("toggles between paused and resumed", async () => {
    const { pauseSwitch } = await loadPauseSwitch();

    expect(pauseSwitch.toggle()).toBe(true);
    expect(pauseSwitch.isPaused()).toBe(true);

    expect(pauseSwitch.toggle()).toBe(false);
    expect(pauseSwitch.isPaused()).toBe(false);
  });

  it("ignores double-pause", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const { audit, pauseSwitch } = await loadPauseSwitch();

    pauseSwitch.pause("first");
    vi.setSystemTime(2_000);
    pauseSwitch.pause("second");

    expect(audit).toHaveBeenCalledTimes(1);
    expect(pauseSwitch.getStatus()).toMatchObject({
      paused: true,
      pausedAt: 1_000,
      pausedBy: "first",
    });
  });

  it("ignores double-resume", async () => {
    const { audit, pauseSwitch } = await loadPauseSwitch();

    pauseSwitch.pause("manual");
    pauseSwitch.resume();
    pauseSwitch.resume();

    expect(audit).toHaveBeenCalledTimes(2);
    expect(pauseSwitch.isPaused()).toBe(false);
  });
});

async function loadPauseSwitch() {
  vi.resetModules();
  const audit = vi.fn();
  vi.doMock("../audit.js", () => ({ audit }));
  vi.spyOn(console, "log").mockImplementation(() => undefined);

  const pauseSwitch = await import("../pause.js");

  return { audit, pauseSwitch };
}
