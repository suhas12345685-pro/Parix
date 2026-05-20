/**
 * Crash reporter for the Aegis browser app.
 *
 * Privacy contract (matches docs/privacy.md):
 *   - No-op unless `window.__PARIX_TELEMETRY__` exposes
 *     `{ enabled: true, consentedAt: string, endpoint: string }`. Atrium's
 *     Aegis relay injects this when serving the SPA; if it isn't present,
 *     we never report.
 *   - Payload: error message, stack, app version, navigator user-agent
 *     family (no full UA string), URL pathname (no query, no hash).
 *
 * Wire-up: call `initCrashReporter()` from main.tsx once.
 */

interface InjectedTelemetry {
  enabled: boolean;
  consentedAt: string | null;
  endpoint?: string;
  version?: string;
}

declare global {
  interface Window {
    __PARIX_TELEMETRY__?: InjectedTelemetry;
  }
}

interface CrashPayload {
  process: "aegis";
  version: string;
  ts: string;
  url: string;
  uaFamily: string;
  errorClass: string;
  errorMessage: string;
  stack: string | null;
  fatal: boolean;
}

let initialized = false;

function getInjected(): InjectedTelemetry | null {
  if (typeof window === "undefined") return null;
  const t = window.__PARIX_TELEMETRY__;
  if (!t) return null;
  if (!t.enabled) return null;
  if (!t.consentedAt) return null;
  if (!t.endpoint) return null;
  return t;
}

function uaFamily(): string {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "edge";
  if (/Chrome\//.test(ua)) return "chrome";
  if (/Firefox\//.test(ua)) return "firefox";
  if (/Safari\//.test(ua)) return "safari";
  return "other";
}

function buildPayload(err: unknown, fatal: boolean): CrashPayload {
  const e =
    err instanceof Error
      ? err
      : new Error(typeof err === "string" ? err : "non-Error rejection");
  const injected = getInjected();
  return {
    process: "aegis",
    version: injected?.version ?? "unknown",
    ts: new Date().toISOString(),
    url: window.location.pathname,
    uaFamily: uaFamily(),
    errorClass: e.name || "Error",
    errorMessage: (e.message || "").slice(0, 1000),
    stack: e.stack?.slice(0, 4000) ?? null,
    fatal,
  };
}

async function post(payload: CrashPayload): Promise<void> {
  const injected = getInjected();
  if (!injected) return;
  try {
    await fetch(injected.endpoint!, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true, // survives page unload during a fatal error
    });
  } catch {
    // Never throw from the reporter.
  }
}

export function initCrashReporter(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  window.addEventListener("error", (e: ErrorEvent) => {
    void post(buildPayload(e.error ?? e.message, true));
  });

  window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
    void post(buildPayload(e.reason, false));
  });
}

export function reportError(err: unknown, context?: string): void {
  const payload = buildPayload(err, false);
  if (context) payload.errorMessage = `${context}: ${payload.errorMessage}`;
  void post(payload);
}
