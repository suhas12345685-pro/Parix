/**
 * CliProcessManager — central lifecycle owner for headless provider CLI
 * processes (codex / claude / gemini).
 *
 * Responsibilities:
 *   1. Registry      — one long-running child per providerId, so a provider can
 *                      hold a terminal session open across turns for context.
 *   2. Teardown      — a process-exit/signal hook guarantees every child is
 *                      killed when the agent loop exits or crashes (no zombies).
 *   3. Stream format — sanitize() strips ANSI codes, spinner frames, CR progress
 *                      bars, and echoed prompts before output reaches the router.
 *
 * Singleton: import { cliProcessManager }.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { ProviderId } from "./BaseProvider.js";

export interface CliSpawnSpec {
  bin: string;
  args: string[];
  env?: Record<string, string>;
  cwd?: string;
}

interface ManagedProcess {
  providerId: ProviderId;
  bin: string;
  child: ChildProcessWithoutNullStreams;
  startedAt: number;
}

export interface ManagedProcessInfo {
  providerId: ProviderId;
  bin: string;
  pid: number | undefined;
  uptimeMs: number;
}

// CSI escape sequences (ESC [ … final-byte). \x1b is an escape, not a literal
// control char in source.
const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
// Braille spinner glyphs used by most CLI loaders (⠋⠙⠹…).
const SPINNER_RE = /[⠀-⣿]/g;

class CliProcessManager {
  private readonly registry = new Map<ProviderId, ManagedProcess>();
  private hookInstalled = false;

  /**
   * Return the live child for a provider, or spawn + register a fresh one.
   * Dead/exited entries are transparently replaced.
   */
  ensure(providerId: ProviderId, spec: CliSpawnSpec): ChildProcessWithoutNullStreams {
    this.installCleanupHook();
    const existing = this.registry.get(providerId);
    if (existing && !existing.child.killed && existing.child.exitCode === null) {
      return existing.child;
    }
    const child = spawn(spec.bin, spec.args, {
      shell: false, // prompts go via stdin, never argv → no shell injection
      windowsHide: true,
      cwd: spec.cwd,
      env: { ...process.env, ...spec.env, NO_COLOR: "1", TERM: "dumb", CI: "1" },
    });
    const managed: ManagedProcess = { providerId, bin: spec.bin, child, startedAt: Date.now() };
    this.registry.set(providerId, managed);
    // Auto-deregister when the child dies on its own.
    child.once("exit", () => {
      if (this.registry.get(providerId)?.child === child) this.registry.delete(providerId);
    });
    return child;
  }

  get(providerId: ProviderId): ChildProcessWithoutNullStreams | undefined {
    return this.registry.get(providerId)?.child;
  }

  has(providerId: ProviderId): boolean {
    const m = this.registry.get(providerId);
    return Boolean(m && !m.child.killed && m.child.exitCode === null);
  }

  list(): ManagedProcessInfo[] {
    const now = Date.now();
    return [...this.registry.values()].map((m) => ({
      providerId: m.providerId,
      bin: m.bin,
      pid: m.child.pid,
      uptimeMs: now - m.startedAt,
    }));
  }

  /** Kill and deregister one provider's process. */
  kill(providerId: ProviderId): void {
    const m = this.registry.get(providerId);
    if (!m) return;
    this.terminate(m);
    this.registry.delete(providerId);
  }

  /** Kill and deregister every managed process. */
  killAll(): void {
    for (const m of this.registry.values()) this.terminate(m);
    this.registry.clear();
  }

  private terminate(m: ManagedProcess): void {
    try {
      m.child.stdin?.end();
      m.child.kill("SIGTERM");
      // Best-effort hard kill — exit handlers run synchronously and can't await
      // a graceful shutdown window.
      if (m.child.exitCode === null) m.child.kill("SIGKILL");
    } catch {
      /* already gone */
    }
  }

  /**
   * Clean a raw CLI stdout chunk before it reaches the router:
   * - strip ANSI escape sequences
   * - normalize CR progress redraws to newlines
   * - drop braille spinner frames
   * - optionally remove a leading echo of the prompt the CLI printed back
   * - collapse runs of blank lines
   */
  sanitize(chunk: string, echoedPrompt?: string): string {
    let text = chunk.replace(ANSI_RE, "").replace(/\r/g, "\n").replace(SPINNER_RE, "");
    if (echoedPrompt) {
      const trimmedPrompt = echoedPrompt.trim();
      const lead = text.trimStart();
      if (trimmedPrompt && lead.startsWith(trimmedPrompt)) {
        text = lead.slice(trimmedPrompt.length);
      }
    }
    return text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  /**
   * Install the teardown hook once. The synchronous "exit" handler is the
   * guaranteed backstop (fires on normal exit, process.exit(), and after an
   * uncaught exception terminates the process). Signal handlers force exit
   * only when we're the sole listener, so we never preempt the host app's own
   * graceful-shutdown handlers.
   */
  private installCleanupHook(): void {
    if (this.hookInstalled) return;
    this.hookInstalled = true;

    process.on("exit", () => this.killAll());

    const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];
    for (const sig of signals) {
      process.on(sig, () => {
        this.killAll();
        // Only force the exit if nothing else is handling this signal,
        // otherwise let the app's own handler decide when to exit.
        if (process.listenerCount(sig) <= 1) process.exit(130);
      });
    }
  }
}

/** Process-wide singleton. */
export const cliProcessManager = new CliProcessManager();
