import { describe, expect, it, vi } from "vitest";
import { isNewer, UpdateChecker } from "../checker.js";

function jsonResponse(status: number, body?: unknown): Response {
  if (status === 204) return new Response(null, { status: 204 });
  return new Response(JSON.stringify(body ?? {}), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("isNewer", () => {
  it("compares semver components in order", () => {
    expect(isNewer("0.2.0", "0.1.7")).toBe(true);
    expect(isNewer("0.1.8", "0.1.7")).toBe(true);
    expect(isNewer("1.0.0", "0.99.99")).toBe(true);
    expect(isNewer("0.1.7", "0.1.7")).toBe(false);
    expect(isNewer("0.1.6", "0.1.7")).toBe(false);
  });

  it("treats stable as newer than prerelease at the same x.y.z", () => {
    expect(isNewer("0.2.0", "0.2.0-alpha")).toBe(true);
    expect(isNewer("0.2.0-alpha", "0.2.0")).toBe(false);
  });
});

describe("UpdateChecker", () => {
  it("marks status=up_to_date on HTTP 204", async () => {
    let lastUrl = "";
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      lastUrl = String(url);
      return jsonResponse(204);
    });
    const checker = new UpdateChecker({
      currentVersion: "0.1.7",
      channel: "stable",
      endpoint: "https://updates.example",
      pollIntervalMs: 60_000,
      fetcher: fetcher as unknown as typeof fetch,
      clock: () => 1000,
    });
    const status = await checker.checkNow();

    expect(status.kind).toBe("up_to_date");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(lastUrl).toMatch(/\/v1\/check\?/);
    expect(lastUrl).toMatch(/channel=stable/);
    expect(lastUrl).toMatch(/version=0\.1\.7/);
  });

  it("emits and stores the info when a newer version is published", async () => {
    const body = {
      latest: "0.2.0",
      url: "https://updates.example/parix-0.2.0.zip",
      sha256: "abc",
      releaseNotes: "Vision OCR via router",
      mandatory: false,
      publishedAt: "2026-05-18T00:00:00Z",
    };
    const fetcher = vi.fn(async () => jsonResponse(200, body));
    const checker = new UpdateChecker({
      currentVersion: "0.1.7",
      channel: "stable",
      endpoint: "https://updates.example",
      pollIntervalMs: 60_000,
      fetcher: fetcher as unknown as typeof fetch,
      clock: () => 1000,
    });

    const listener = vi.fn();
    const off = checker.onUpdateAvailable(listener);
    const status = await checker.checkNow();
    off();

    expect(status.kind).toBe("available");
    if (status.kind === "available") {
      expect(status.info.latest).toBe("0.2.0");
      expect(status.info.url).toBe(body.url);
    }
    expect(listener).toHaveBeenCalledOnce();
  });

  it("does not emit when latest is older than current", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(200, { latest: "0.1.0", url: "" }),
    );
    const checker = new UpdateChecker({
      currentVersion: "0.1.7",
      channel: "stable",
      endpoint: "https://updates.example",
      pollIntervalMs: 60_000,
      fetcher: fetcher as unknown as typeof fetch,
      clock: () => 1000,
    });
    const status = await checker.checkNow();
    expect(status.kind).toBe("up_to_date");
  });

  it("stores an error state on HTTP failure but does not throw", async () => {
    const fetcher = vi.fn(async () => jsonResponse(500));
    const checker = new UpdateChecker({
      currentVersion: "0.1.7",
      channel: "stable",
      endpoint: "https://updates.example",
      pollIntervalMs: 60_000,
      fetcher: fetcher as unknown as typeof fetch,
      clock: () => 1000,
    });
    const status = await checker.checkNow();
    expect(status.kind).toBe("error");
    if (status.kind === "error") expect(status.reason).toMatch(/HTTP 500/);
  });

  it("stores an error state on network throw", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const checker = new UpdateChecker({
      currentVersion: "0.1.7",
      channel: "stable",
      endpoint: "https://updates.example",
      pollIntervalMs: 60_000,
      fetcher: fetcher as unknown as typeof fetch,
      clock: () => 1000,
    });
    const status = await checker.checkNow();
    expect(status.kind).toBe("error");
    if (status.kind === "error") expect(status.reason).toMatch(/ECONNREFUSED/);
  });

  it("flags malformed payloads (missing latest)", async () => {
    const fetcher = vi.fn(async () => jsonResponse(200, { url: "x" }));
    const checker = new UpdateChecker({
      currentVersion: "0.1.7",
      channel: "stable",
      endpoint: "https://updates.example",
      pollIntervalMs: 60_000,
      fetcher: fetcher as unknown as typeof fetch,
      clock: () => 1000,
    });
    const status = await checker.checkNow();
    expect(status.kind).toBe("error");
    if (status.kind === "error") expect(status.reason).toMatch(/malformed/);
  });
});
