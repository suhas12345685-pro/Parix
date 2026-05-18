/**
 * Auto-update poll client.
 *
 * Polls the update endpoint at startup and on a schedule, exposes the
 * "latest known release" via a small in-process API, and emits an event
 * when a new version becomes available. We never auto-install — Aegis
 * decides how to present the offer to the user.
 *
 * Endpoint contract (server side — to be implemented in v1.0 D-track):
 *
 *   GET <endpoint>/v1/check?platform=<platform>&channel=<channel>&version=<current>
 *
 *   200 OK with body:
 *     {
 *       "latest":       "0.2.0",            // semver
 *       "url":          "https://...",      // download URL
 *       "sha256":       "deadbeef...",      // archive checksum
 *       "releaseNotes": "Bug fixes and...", // markdown
 *       "mandatory":    false,              // hard-block older client?
 *       "publishedAt":  "2026-05-18T..."    // ISO8601
 *     }
 *
 *   204 No Content — current version is already latest for this channel
 *
 *   Any other status — checker logs and stays on the previous state.
 *
 * The server SHOULD be a static JSON file behind a CDN; nothing dynamic
 * is required (channel + platform map to a fixed manifest path).
 */

import { EventEmitter } from "events";
import type { UpdateChannel } from "parix-shared";

export interface UpdateAvailableInfo {
  current: string;
  latest: string;
  url: string;
  sha256: string;
  releaseNotes: string;
  mandatory: boolean;
  publishedAt: string;
  channel: UpdateChannel;
}

export interface UpdateCheckerOptions {
  currentVersion: string;
  channel: UpdateChannel;
  endpoint: string;
  pollIntervalMs: number;
  platform?: string;
  fetcher?: typeof fetch;
  clock?: () => number;
}

export type UpdateCheckerStatus =
  | { kind: "unknown" }
  | { kind: "up_to_date"; checkedAt: number }
  | { kind: "available"; info: UpdateAvailableInfo; checkedAt: number }
  | { kind: "error"; reason: string; checkedAt: number };

export class UpdateChecker {
  private readonly opts: Required<
    Omit<UpdateCheckerOptions, "fetcher" | "clock">
  > & {
    fetcher: typeof fetch;
    clock: () => number;
  };
  private readonly emitter = new EventEmitter();
  private status: UpdateCheckerStatus = { kind: "unknown" };
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: UpdateCheckerOptions) {
    this.opts = {
      currentVersion: options.currentVersion,
      channel: options.channel,
      endpoint: options.endpoint.replace(/\/+$/, ""),
      pollIntervalMs: options.pollIntervalMs,
      platform: options.platform ?? defaultPlatform(),
      fetcher: options.fetcher ?? fetch,
      clock: options.clock ?? Date.now,
    };
  }

  /** Run one poll now. Safe to call repeatedly. */
  async checkNow(): Promise<UpdateCheckerStatus> {
    const url =
      `${this.opts.endpoint}/v1/check` +
      `?platform=${encodeURIComponent(this.opts.platform)}` +
      `&channel=${encodeURIComponent(this.opts.channel)}` +
      `&version=${encodeURIComponent(this.opts.currentVersion)}`;

    const checkedAt = this.opts.clock();

    try {
      const res = await this.opts.fetcher(url, { method: "GET" });
      if (res.status === 204) {
        this.setStatus({ kind: "up_to_date", checkedAt });
        return this.status;
      }
      if (!res.ok) {
        this.setStatus({
          kind: "error",
          reason: `HTTP ${res.status}`,
          checkedAt,
        });
        return this.status;
      }
      const body = (await res.json()) as Partial<UpdateAvailableInfo> & {
        latest?: string;
      };
      if (!body || typeof body.latest !== "string") {
        this.setStatus({
          kind: "error",
          reason: "malformed response (no latest)",
          checkedAt,
        });
        return this.status;
      }
      if (!isNewer(body.latest, this.opts.currentVersion)) {
        this.setStatus({ kind: "up_to_date", checkedAt });
        return this.status;
      }
      const info: UpdateAvailableInfo = {
        current: this.opts.currentVersion,
        latest: body.latest,
        url: body.url ?? "",
        sha256: body.sha256 ?? "",
        releaseNotes: body.releaseNotes ?? "",
        mandatory: Boolean(body.mandatory),
        publishedAt: body.publishedAt ?? "",
        channel: this.opts.channel,
      };
      this.setStatus({ kind: "available", info, checkedAt });
      this.emitter.emit("update_available", info);
      return this.status;
    } catch (err) {
      this.setStatus({
        kind: "error",
        reason: err instanceof Error ? err.message : String(err),
        checkedAt,
      });
      return this.status;
    }
  }

  /** Start scheduled polling. checkNow() fires immediately. */
  start(): void {
    if (this.timer) return;
    void this.checkNow();
    this.timer = setInterval(
      () => void this.checkNow(),
      this.opts.pollIntervalMs,
    );
    if (typeof (this.timer as { unref?: () => void }).unref === "function") {
      (this.timer as { unref: () => void }).unref();
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getStatus(): UpdateCheckerStatus {
    return this.status;
  }

  onUpdateAvailable(listener: (info: UpdateAvailableInfo) => void): () => void {
    this.emitter.on("update_available", listener);
    return () => this.emitter.off("update_available", listener);
  }

  private setStatus(next: UpdateCheckerStatus): void {
    this.status = next;
  }
}

function defaultPlatform(): string {
  const p = process.platform;
  if (p === "win32") return "windows";
  if (p === "darwin") return "macos";
  if (p === "linux") return "linux";
  return p;
}

/** True if `candidate` is a strictly newer semver than `current`. */
export function isNewer(candidate: string, current: string): boolean {
  const a = parseSemver(candidate);
  const b = parseSemver(current);
  if (!a || !b) return candidate !== current;
  if (a.major !== b.major) return a.major > b.major;
  if (a.minor !== b.minor) return a.minor > b.minor;
  if (a.patch !== b.patch) return a.patch > b.patch;
  // Stable > prerelease at the same x.y.z.
  if (!a.pre && b.pre) return true;
  if (a.pre && !b.pre) return false;
  return false;
}

function parseSemver(
  v: string,
): { major: number; minor: number; patch: number; pre: string | null } | null {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:[-+](.+))?$/.exec(v.trim());
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    pre: m[4] ?? null,
  };
}
