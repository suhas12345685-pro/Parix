import { describe, expect, it, vi } from "vitest";
import { Debouncer } from "../../src/queue/debouncer.js";

describe("Debouncer", () => {
  it("collapses events with the same key inside the window", async () => {
    vi.useFakeTimers();
    const flushed: Array<{
      count: number;
      value: { kind: string; value: number };
    }> = [];
    let now = 1000;
    const debouncer = new Debouncer<{ kind: string; value: number }>({
      windowMs: 50,
      now: () => now,
      keyFor: (event) => event.kind,
      onFlush: (event) =>
        flushed.push({ count: event.count, value: event.value }),
    });

    debouncer.push({ kind: "terminal_error", value: 1 });
    now += 10;
    debouncer.push({ kind: "terminal_error", value: 2 });

    await vi.advanceTimersByTimeAsync(49);
    expect(flushed).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(flushed).toEqual([
      { count: 2, value: { kind: "terminal_error", value: 2 } },
    ]);
    vi.useRealTimers();
  });

  it("flushes all pending keys on demand", async () => {
    const flushed: string[] = [];
    const debouncer = new Debouncer<string>({
      windowMs: 1000,
      keyFor: (value) => value,
      onFlush: (event) => flushed.push(event.key),
    });

    debouncer.push("a");
    debouncer.push("b");
    await debouncer.flush();

    expect(flushed.sort()).toEqual(["a", "b"]);
    expect(debouncer.size()).toBe(0);
  });
});
