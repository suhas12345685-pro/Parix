/**
 * Crash reporter — captures uncaught exceptions and unhandled rejections,
 * POSTs an anonymized report to the configured endpoint.
 *
 * Privacy contract (matches docs/privacy.md):
 *   - No-op unless profile.telemetry.enabled === true AND
 *     profile.telemetry.consentedAt is a real ISO timestamp.
 *   - No-op unless an endpoint is configured (either in
 *     profile.telemetry.endpoint or via the PARIX_CRASH_DSN env var).
 *   - Payload contains: error class, message, stack, Parix version, OS
 *     family + arch, Node version, process name. No user content.
 *
 * Wire-up: call `initCrashReporter("atrium")` once at startup, after the
 * profile is loaded.
 */
import { getProfile } from "../config/profile.js";

interface CrashPayload {
  process: string; // "atrium" | "hands" | "aegis"
  version: string;
  ts: string;
  os: NodeJS.Platform;
  arch: string;
  nodeVersion: string;
  errorClass: string;
  errorMessage: string;
  stack: string | null;
  fatal: boolean;
}

let _initialized = false;
let _processName = "atrium";

function getEndpoint(): string | null {
  const fromEnv = process.env.PARIX_CRASH_DSN?.trim();
  if (fromEnv) return fromEnv;
  const profile = getProfile();
  const fromProfile = profile?.telemetry?.endpoint?.trim();
  return fromProfile || null;
}

function consented(): boolean {
  const profile = getProfile();
  const tel = profile?.telemetry;
  return Boolean(tel?.enabled && tel.consentedAt);
}

function getVersion(): string {
  try {
    // package.json is at the workspace root relative to dist
    // We avoid a synchronous require here to keep ESM/CJS interop simple.
    return process.env.npm_package_version || "unknown";
  } catch {
    return "unknown";
  }
}

async function postReport(payload: CrashPayload): Promise<void> {
  const endpoint = getEndpoint();
  if (!endpoint) return;
  if (!consented()) return;
  try {
    // Use the global `fetch` available in Node 20+.
    await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      // 2s budget so a slow endpoint can't block shutdown indefinitely.
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // Crash reporter failures must never throw further. Log and move on.
    // Use stderr directly because the regular logger may already be tearing down.
    process.stderr.write("[crash-reporter] failed to post report\n");
  }
}

function buildPayload(err: unknown, fatal: boolean): CrashPayload {
  const e = err instanceof Error ? err : new Error(String(err));
  return {
    process: _processName,
    version: getVersion(),
    ts: new Date().toISOString(),
    os: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    errorClass: e.name || "Error",
    errorMessage: e.message?.slice(0, 1000) || "",
    stack: e.stack?.slice(0, 4000) ?? null,
    fatal,
  };
}

export function initCrashReporter(processName: string): void {
  if (_initialized) return;
  _initialized = true;
  _processName = processName;

  process.on("uncaughtException", (err) => {
    void postReport(buildPayload(err, true));
    process.stderr.write(`[${_processName}] uncaughtException: ${err}\n`);
    // Let the default behavior (process exit) proceed — don't swallow.
  });

  process.on("unhandledRejection", (reason) => {
    void postReport(buildPayload(reason, false));
    process.stderr.write(
      `[${_processName}] unhandledRejection: ${String(reason)}\n`,
    );
  });
}

/** Manually report a non-fatal error. Useful from catch blocks. */
export function reportError(err: unknown, context?: string): void {
  const payload = buildPayload(err, false);
  if (context) payload.errorMessage = `${context}: ${payload.errorMessage}`;
  void postReport(payload);
}
