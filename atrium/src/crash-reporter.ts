import { appendFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { dirname, resolve } from "path";
import { randomUUID } from "crypto";
import type { ParixProfile } from "parix-shared";
import { getDb } from "./memory/db.js";

type CrashKind = "uncaught_exception" | "unhandled_rejection" | "manual";

export interface CrashReportContext {
  phase?: string;
  fatal?: boolean;
  [key: string]: unknown;
}

interface CrashReport {
  id: string;
  component: "atrium";
  kind: CrashKind;
  message: string;
  stack: string | null;
  context: CrashReportContext;
  telemetryEnabled: boolean;
  createdAt: string;
  runtime: {
    node: string;
    platform: NodeJS.Platform;
    arch: string;
  };
}

let runtimeProfile: ParixProfile | null = null;
let installed = false;

export function installAtriumCrashReporter(profile: ParixProfile | null): void {
  runtimeProfile = profile;
  if (installed) return;
  installed = true;

  process.on("unhandledRejection", (reason) => {
    void captureAtriumCrash(reason, "unhandled_rejection", {
      phase: "runtime",
      fatal: false,
    });
  });

  process.on("uncaughtException", (error) => {
    const timeout = setTimeout(() => process.exit(1), 3000);
    void captureAtriumCrash(error, "uncaught_exception", {
      phase: "runtime",
      fatal: true,
    }).finally(() => {
      clearTimeout(timeout);
      process.exit(1);
    });
  });
}

export async function captureAtriumCrash(
  error: unknown,
  kind: CrashKind = "manual",
  context: CrashReportContext = {},
): Promise<void> {
  const telemetryEnabled = isTelemetryEnabled(runtimeProfile);
  const report = buildReport(error, kind, context, telemetryEnabled);

  writeLocalReport(report);
  persistReport(report);

  if (telemetryEnabled) {
    await uploadReport(report);
  }
}

function buildReport(
  error: unknown,
  kind: CrashKind,
  context: CrashReportContext,
  telemetryEnabled: boolean,
): CrashReport {
  const err = normalizeError(error);
  return {
    id: randomUUID(),
    component: "atrium",
    kind,
    message: truncate(err.message, 1000),
    stack: err.stack ? truncate(err.stack, 8000) : null,
    context: sanitizeContext(context),
    telemetryEnabled,
    createdAt: new Date().toISOString(),
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
  };
}

function writeLocalReport(report: CrashReport): void {
  try {
    const path = resolve(getParixHome(), "crash-reports", "atrium.jsonl");
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify(report)}\n`, "utf-8");
  } catch {
    // Crash reporting must never become the crash.
  }
}

function persistReport(report: CrashReport): void {
  try {
    getDb().run(
      `INSERT INTO crash_reports
       (id, component, kind, message, stack, context_json, telemetry_enabled, uploaded)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        report.id,
        report.component,
        report.kind,
        report.message,
        report.stack,
        JSON.stringify(report.context),
        report.telemetryEnabled ? 1 : 0,
      ],
    );
  } catch {
    // Database may not be initialized during early boot failures.
  }
}

async function uploadReport(report: CrashReport): Promise<void> {
  const endpoint = process.env.PARIX_CRASH_REPORT_ENDPOINT;
  if (!endpoint) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report),
      signal: controller.signal,
    });
    if (response.ok) {
      markUploaded(report.id);
    }
  } catch {
    // Local queue remains available for later inspection.
  } finally {
    clearTimeout(timeout);
  }
}

function markUploaded(reportId: string): void {
  try {
    getDb().run("UPDATE crash_reports SET uploaded = 1 WHERE id = ?", [
      reportId,
    ]);
  } catch {
    // Best effort only.
  }
}

function isTelemetryEnabled(profile: ParixProfile | null): boolean {
  return Boolean(profile?.telemetry?.enabled && profile.telemetry.consentedAt);
}

function normalizeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      message: error.message || error.name,
      stack: error.stack,
    };
  }
  return {
    message:
      typeof error === "string" ? error : JSON.stringify(error, null, 2) || "",
  };
}

function sanitizeContext(context: CrashReportContext): CrashReportContext {
  const safe: CrashReportContext = {};
  for (const [key, value] of Object.entries(context)) {
    if (/token|secret|key|password|credential/i.test(key)) continue;
    if (typeof value === "string") safe[key] = truncate(value, 500);
    else if (typeof value === "number" || typeof value === "boolean")
      safe[key] = value;
    else if (value === null) safe[key] = null;
    else safe[key] = "[redacted-object]";
  }
  return safe;
}

function getParixHome(): string {
  return process.env.PARIX_HOME || resolve(homedir(), ".parix");
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}
