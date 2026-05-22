/**
 * Specialist Spawner — "Manifesting the Avengers"
 *
 * The Nexus does not do the grunt work. It manifests specialized
 * ephemeral workers for heavy tasks (PDF analysis, web scraping,
 * code fixing, research). Each specialist is sandboxed and reports
 * results back to the main Atrium loop.
 *
 * Architecture:
 *   Nexus (Main Loop) → stays light, manages goals
 *   Spawn (Sub-Agent) → ephemeral worker for a single purpose
 */

import { Worker } from 'worker_threads';
import { randomUUID } from 'crypto';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type {
  SpecialistType,
  ManifestSpecialistRequest,
  SpawnRequest,
  SpawnResult,
  ActiveSpecialist,
} from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── State ─────────────────────────────────────────────────────

const activeWorkers = new Map<string, { worker: Worker; meta: ActiveSpecialist }>();
const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes
const MAX_CONCURRENT_SPECIALISTS = 5;
const DEFAULT_TOOL_PERMISSION = 'SANDBOX_ONLY';

// ─── Specialist Registry ───────────────────────────────────────

const SPECIALIST_DESCRIPTIONS: Record<SpecialistType, string> = {
  scout:      'Discovery specialist — scrapes pages, finds contacts, summarizes opportunities',
  coder:      'Code specialist — runs installs, tests, fixes types and dependencies',
  researcher: 'Research specialist — reads repos and docs, generates "State of the Art" reports',
  analyst:    'Analysis specialist — processes data, generates insights and trend reports',
  fixer:      'Repair specialist — diagnoses specific issues and applies targeted fixes',
};

// ─── Core ──────────────────────────────────────────────────────

/**
 * Spawn an ephemeral specialist worker for a heavy task.
 * The worker runs in a sandboxed thread and reports results back.
 *
 * @throws Error if max concurrent specialists reached
 * @throws Error if worker fails or times out
 */
export async function spawnSpecialist(request: SpawnRequest): Promise<SpawnResult> {
  if (activeWorkers.size >= MAX_CONCURRENT_SPECIALISTS) {
    throw new Error(
      `[NEXUS] Cannot spawn ${request.type}: max concurrent specialists (${MAX_CONCURRENT_SPECIALISTS}) reached. ` +
      `Active: ${Array.from(activeWorkers.values()).map(w => `${w.meta.type}:${w.meta.id.slice(0, 8)}`).join(', ')}`
    );
  }

  const id = randomUUID();
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const startTime = Date.now();

  console.log(
    `[NEXUS] Manifesting ${request.type} specialist (${id.slice(0, 8)}) for goal: "${request.goal}"`
  );

  const meta: ActiveSpecialist = {
    id,
    type: request.type,
    goal: request.goal,
    startedAt: startTime,
    timeoutMs,
  };

  return new Promise<SpawnResult>((resolvePromise) => {
    const workerPath = resolve(__dirname, 'specialist-worker.js');

    let worker: Worker;
    try {
      worker = new Worker(workerPath, {
        workerData: {
          id,
          type: request.type,
          goal: request.goal,
          payload: request.payload,
          permissions: request.permissions,
          description: SPECIALIST_DESCRIPTIONS[request.type],
        },
      });
    } catch (err) {
      // Worker file may not exist yet — return a structured failure
      console.warn(`[NEXUS] Worker script not found, using inline execution for ${request.type}`);
      const elapsed = Date.now() - startTime;
      resolvePromise({
        specialistType: request.type,
        goal: request.goal,
        success: false,
        output: null,
        error: `Worker script not available: ${(err as Error).message}`,
        executionTimeMs: elapsed,
      });
      return;
    }

    activeWorkers.set(id, { worker, meta });

    // Timeout guard
    const timer = setTimeout(() => {
      console.warn(`[NEXUS] ${request.type} specialist (${id.slice(0, 8)}) timed out after ${timeoutMs}ms`);
      worker.terminate();
      activeWorkers.delete(id);
      resolvePromise({
        specialistType: request.type,
        goal: request.goal,
        success: false,
        output: null,
        error: `Specialist timed out after ${timeoutMs}ms`,
        executionTimeMs: timeoutMs,
      });
    }, timeoutMs);

    worker.on('message', (result: unknown) => {
      clearTimeout(timer);
      const elapsed = Date.now() - startTime;
      activeWorkers.delete(id);

      console.log(
        `[NEXUS] ${request.type} specialist (${id.slice(0, 8)}) re-absorbed after ${elapsed}ms`
      );

      resolvePromise({
        specialistType: request.type,
        goal: request.goal,
        success: true,
        output: result,
        executionTimeMs: elapsed,
      });
    });

    worker.on('error', (err) => {
      clearTimeout(timer);
      const elapsed = Date.now() - startTime;
      activeWorkers.delete(id);

      console.error(
        `[NEXUS] ${request.type} specialist (${id.slice(0, 8)}) failed:`,
        err.message
      );

      resolvePromise({
        specialistType: request.type,
        goal: request.goal,
        success: false,
        output: null,
        error: err.message,
        executionTimeMs: elapsed,
      });
    });

    worker.on('exit', (code) => {
      clearTimeout(timer);
      activeWorkers.delete(id);
      if (code !== 0 && code !== null) {
        const elapsed = Date.now() - startTime;
        resolvePromise({
          specialistType: request.type,
          goal: request.goal,
          success: false,
          output: null,
          error: `Worker exited with code ${code}`,
          executionTimeMs: elapsed,
        });
      }
    });
  });
}

/**
 * Tool-facing wrapper for the Pulse/Nexus prompt contract.
 *
 * `manifest_specialist` defaults to sandbox-only work and intentionally does
 * not expose FULL permissions. The Nexus reabsorbs the result and remains the
 * decision-maker.
 */
export async function manifestSpecialist(
  request: ManifestSpecialistRequest,
): Promise<SpawnResult> {
  const payload = {
    ...(request.payload ?? {}),
    ...(request.expectedOutput
      ? { expectedOutput: request.expectedOutput }
      : {}),
  };

  return spawnSpecialist({
    type: request.type,
    goal: request.goal,
    payload,
    timeoutMs: request.timeoutMs,
    permissions: request.permissions ?? DEFAULT_TOOL_PERMISSION,
  });
}

/**
 * Get all currently active specialists.
 */
export function getActiveSpecialists(): ActiveSpecialist[] {
  return Array.from(activeWorkers.values()).map(w => w.meta);
}

/**
 * Terminate a specific specialist by ID.
 */
export function terminateSpecialist(id: string): boolean {
  const entry = activeWorkers.get(id);
  if (!entry) return false;

  console.log(`[NEXUS] Terminating ${entry.meta.type} specialist (${id.slice(0, 8)})`);
  entry.worker.terminate();
  activeWorkers.delete(id);
  return true;
}

/**
 * Terminate all active specialists.
 */
export function terminateAll(): number {
  const count = activeWorkers.size;
  for (const [id, entry] of activeWorkers) {
    entry.worker.terminate();
    activeWorkers.delete(id);
  }
  if (count > 0) {
    console.log(`[NEXUS] Terminated ${count} active specialist(s)`);
  }
  return count;
}

/**
 * Get specialist capability descriptions.
 */
export function getSpecialistCapabilities(): Record<SpecialistType, string> {
  return { ...SPECIALIST_DESCRIPTIONS };
}
