import { spawn } from "child_process";
import { existsSync } from "fs";
import { resolve } from "path";
import type {
  SkillManifest,
  SkillPermission,
} from "../../../shared/types/skill.js";

const DEFAULT_TIMEOUT_MS = 60_000;

const RUNTIME_INTERPRETER: Record<SkillManifest["runtime"], string> = {
  py: process.platform === "win32" ? "python" : "python3",
  node: "node",
  sh: process.platform === "win32" ? "bash" : "bash",
};

export interface SkillResult {
  skillId: string;
  success: boolean;
  exitCode: number | null;
  durationMs: number;
  stdout: string;
  stderr: string;
  output?: Record<string, unknown>; // parsed JSON from stdout if available
  error?: string; // non-zero exit message or timeout
  timedOut: boolean;
}

export interface RunOptions {
  skillDir: string; // absolute path to the skill folder (where SKILL.md lives)
  manifest: SkillManifest;
  inputs?: Record<string, unknown>;
  env?: Record<string, string>;
  cwd?: string; // default: skillDir
  permittedPermissions?: Set<SkillPermission>; // gate, see assertPermissions
}

export class SkillPermissionError extends Error {
  constructor(public missing: SkillPermission[]) {
    super(
      `Skill blocked: missing required permission(s): ${missing.join(", ")}`,
    );
    this.name = "SkillPermissionError";
  }
}

/**
 * Run a skill: spawns the manifest's `entry` script under the configured
 * runtime, feeds normalized inputs via stdin (as JSON), captures stdout/stderr,
 * enforces a timeout, and returns a normalized `SkillResult`.
 *
 * The caller is responsible for clearance: pass `permittedPermissions` to
 * enforce that the manifest's `permissions` list is a subset. Constitution /
 * reversibility checks should be applied separately at the council layer.
 */
export async function runSkill(opts: RunOptions): Promise<SkillResult> {
  const { skillDir, manifest, inputs = {} } = opts;

  // Permission gate — if caller supplied a clearance set, every requested
  // permission must be in it.
  if (opts.permittedPermissions) {
    const missing = manifest.permissions.filter(
      (p) => !opts.permittedPermissions!.has(p),
    );
    if (missing.length > 0) throw new SkillPermissionError(missing);
  }

  const entry = resolve(skillDir, manifest.entry);
  if (!existsSync(entry)) {
    return {
      skillId: manifest.id,
      success: false,
      exitCode: null,
      durationMs: 0,
      stdout: "",
      stderr: "",
      error: `entry not found: ${entry}`,
      timedOut: false,
    };
  }

  const interpreter = RUNTIME_INTERPRETER[manifest.runtime];
  const timeoutMs = manifest.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const cwd = opts.cwd ?? skillDir;
  const started = Date.now();

  return new Promise<SkillResult>((resolvePromise) => {
    const child = spawn(interpreter, [entry], {
      cwd,
      env: { ...process.env, ...(opts.env ?? {}) },
      shell: false,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      // Best-effort terminate. SIGTERM first; SIGKILL fallback after grace.
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, 2000);
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolvePromise({
        skillId: manifest.id,
        success: false,
        exitCode: null,
        durationMs: Date.now() - started,
        stdout,
        stderr,
        error: err.message,
        timedOut,
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const durationMs = Date.now() - started;
      const success = !timedOut && code === 0;

      // Try to parse stdout as JSON to populate `output`.
      let output: Record<string, unknown> | undefined;
      const trimmed = stdout.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            output = parsed as Record<string, unknown>;
          }
        } catch {
          // not JSON — leave output undefined
        }
      }

      resolvePromise({
        skillId: manifest.id,
        success,
        exitCode: code,
        durationMs,
        stdout,
        stderr,
        output,
        error: timedOut
          ? `timeout after ${timeoutMs}ms`
          : success
            ? undefined
            : `exit ${code}: ${stderr.slice(0, 240) || "no stderr"}`,
        timedOut,
      });
    });

    // Feed inputs as a single JSON line on stdin. Skills that don't read stdin
    // simply ignore it.
    try {
      child.stdin.write(JSON.stringify(inputs) + "\n");
      child.stdin.end();
    } catch {
      // child may already have exited
    }
  });
}

