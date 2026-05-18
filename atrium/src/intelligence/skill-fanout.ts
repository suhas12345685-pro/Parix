/**
 * Parallel skill dispatch.
 *
 * When cognition matches multiple skills to a single event, council runs
 * them concurrently here under a fixed fan-out cap. The cap protects
 * against runaway resource use when an event triggers many skills at
 * once (or when a future LLM router proposes a wide tool-call array).
 *
 * Aggregation is "any-success" by default: the combined call is reported
 * as successful if at least one skill succeeded, but every individual
 * result is preserved on `perSkill`. Callers decide how to interpret
 * partial failure — for example, the audit log records the full list so
 * a failed sub-skill is still visible.
 */

import { runSkill, SkillPermissionError, type SkillResult } from "./skill-runner.js";
import {
  resolvePermittedPermissions,
} from "./skill-permissions.js";
import {
  getRegisteredSkill,
  type RegisteredSkill,
} from "./skill-registry.js";

// Conservative defaults per the architecture pick. Not user-configurable
// yet — Phase 4 promotes these to profile-level overrides.
export const MAX_CONCURRENT_SKILLS_PER_TASK = 4;

export interface FanoutInput {
  skillId: string;
  inputs: Record<string, unknown>;
}

export interface FanoutOptions {
  autonomousMode?: boolean;
  // Override the cap for tests; production callers should not pass this.
  concurrency?: number;
  // Per-skill input augmenter — called just before runSkill. Used by
  // council to inject the latest a11y snapshot for skills that declare
  // `accessibility:read`. Returning the inputs unchanged is fine.
  augmentInputs?: (
    skill: RegisteredSkill,
    inputs: Record<string, unknown>,
  ) => Promise<Record<string, unknown>> | Record<string, unknown>;
}

export interface FanoutPerSkill {
  skillId: string;
  success: boolean;
  output?: string;
  error?: string;
  durationMs: number;
}

export interface FanoutResult {
  success: boolean;
  perSkill: FanoutPerSkill[];
  // Aggregated, JSON-stringified `{[skillId]: output}` for skills that
  // returned parseable JSON output, or raw stdout otherwise. `undefined`
  // when every skill failed before producing output.
  output?: string;
  error?: string;
}

export async function runSkillsInParallel(
  calls: FanoutInput[],
  opts: FanoutOptions = {},
): Promise<FanoutResult> {
  if (calls.length === 0) {
    return { success: false, perSkill: [], error: "no skills to run" };
  }

  const concurrency = Math.max(
    1,
    Math.min(opts.concurrency ?? MAX_CONCURRENT_SKILLS_PER_TASK, calls.length),
  );

  // Tiny inline semaphore — no extra dep, ~10 lines.
  const queue = calls.slice();
  const perSkill: FanoutPerSkill[] = [];

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const call = queue.shift();
      if (!call) return;
      perSkill.push(await runOne(call, opts));
    }
  }

  await Promise.all(
    Array.from({ length: concurrency }, () => worker()),
  );

  // Restore caller-given order so downstream consumers (audit, UI) see a
  // stable list rather than completion-order.
  const orderedIds = calls.map((c) => c.skillId);
  perSkill.sort(
    (a, b) =>
      orderedIds.indexOf(a.skillId) - orderedIds.indexOf(b.skillId),
  );

  const anySuccess = perSkill.some((r) => r.success);
  const successOutputs: Record<string, string> = {};
  for (const r of perSkill) {
    if (r.success && r.output !== undefined) successOutputs[r.skillId] = r.output;
  }
  const aggregatedOutput =
    Object.keys(successOutputs).length > 0
      ? JSON.stringify(successOutputs)
      : undefined;

  // Surface the first error from a failed skill, plus a count if there
  // were others. Keeps the existing single-error contract on `result.error`
  // intact for the most common case (one matched skill that failed).
  const failures = perSkill.filter((r) => !r.success);
  const error = failures.length > 0
    ? failures.length === 1
      ? failures[0].error
      : `${failures[0].error} (+${failures.length - 1} other skill failure${failures.length - 1 === 1 ? "" : "s"})`
    : undefined;

  return {
    success: anySuccess,
    perSkill,
    output: aggregatedOutput,
    error,
  };
}

async function runOne(
  call: FanoutInput,
  opts: FanoutOptions,
): Promise<FanoutPerSkill> {
  const started = Date.now();
  const reg = getRegisteredSkill(call.skillId);
  if (!reg) {
    return {
      skillId: call.skillId,
      success: false,
      error: `skill not registered: ${call.skillId}`,
      durationMs: Date.now() - started,
    };
  }

  let inputs: Record<string, unknown> = call.inputs;
  if (opts.augmentInputs) {
    inputs = await opts.augmentInputs(reg, inputs);
  }

  try {
    const result: SkillResult = await runSkill({
      skillDir: reg.skillDir,
      manifest: reg.manifest,
      inputs,
      permittedPermissions: resolvePermittedPermissions(reg.manifest, {
        autonomousMode: opts.autonomousMode,
      }),
    });
    return {
      skillId: call.skillId,
      success: result.success,
      output: result.output
        ? JSON.stringify(result.output)
        : result.stdout || undefined,
      error: result.error,
      durationMs: result.durationMs,
    };
  } catch (err) {
    if (err instanceof SkillPermissionError) {
      return {
        skillId: call.skillId,
        success: false,
        error: err.message,
        durationMs: Date.now() - started,
      };
    }
    return {
      skillId: call.skillId,
      success: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - started,
    };
  }
}
