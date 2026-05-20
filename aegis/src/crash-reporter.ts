type AegisCrashKind = "window_error" | "unhandled_rejection" | "manual";

interface AegisCrashReport {
  id: string;
  component: "aegis";
  kind: AegisCrashKind;
  message: string;
  stack: string | null;
  createdAt: string;
  runtime: {
    userAgent: string;
    url: string;
  };
}

let installed = false;

export function installAegisCrashReporter(): void {
  if (installed) return;
  installed = true;

  window.addEventListener("error", (event) => {
    captureAegisCrash(event.error ?? event.message, "window_error");
  });

  window.addEventListener("unhandledrejection", (event) => {
    captureAegisCrash(event.reason, "unhandled_rejection");
  });
}

export function captureAegisCrash(
  error: unknown,
  kind: AegisCrashKind = "manual",
): void {
  const report = buildReport(error, kind);
  writeLocalFallback(report);
  uploadReport(report);
}

function buildReport(error: unknown, kind: AegisCrashKind): AegisCrashReport {
  const normalized = normalizeError(error);
  return {
    id: crypto.randomUUID(),
    component: "aegis",
    kind,
    message: truncate(normalized.message, 1000),
    stack: normalized.stack ? truncate(normalized.stack, 8000) : null,
    createdAt: new Date().toISOString(),
    runtime: {
      userAgent: navigator.userAgent,
      url: location.origin + location.pathname,
    },
  };
}

function uploadReport(report: AegisCrashReport): void {
  if (!telemetryEnabled()) return;
  const endpoint = import.meta.env.VITE_PARIX_CRASH_REPORT_ENDPOINT;
  if (!endpoint) return;

  const body = JSON.stringify(report);
  if (navigator.sendBeacon) {
    navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
    return;
  }

  void fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // The report remains in the browser fallback queue.
  });
}

function writeLocalFallback(report: AegisCrashReport): void {
  try {
    const key = "parix:aegis-crash-reports";
    const previous = JSON.parse(localStorage.getItem(key) ?? "[]") as unknown[];
    previous.push(report);
    localStorage.setItem(key, JSON.stringify(previous.slice(-20)));
  } catch {
    // Ignore storage failures.
  }
}

function telemetryEnabled(): boolean {
  return (
    import.meta.env.VITE_PARIX_TELEMETRY_ENABLED === "true" ||
    localStorage.getItem("parix:telemetry-enabled") === "true"
  );
}

function normalizeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message || error.name, stack: error.stack };
  }
  return {
    message:
      typeof error === "string" ? error : JSON.stringify(error, null, 2) || "",
  };
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}
