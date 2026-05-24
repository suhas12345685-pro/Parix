/**
 * SilentCliBridge — runs an official provider CLI (codex / claude / gemini) as a
 * headless background process and pipes prompts through it.
 *
 * Why a bridge instead of reimplementing each CLI's auth: the official CLIs
 * already handle login/subscription/keys themselves. We just feed them prompts
 * over stdin and read the answer from stdout — no credential reimplementation,
 * no GUI window, no ToS gymnastics.
 *
 * Two execution shapes are supported:
 *   - oneShot():     spawn per turn (stateless, simplest, most robust)
 *   - persistent:    keep one child alive across turns to preserve context
 *                    (set `persistent: true`); falls back to oneShot if the
 *                    child dies.
 *
 * Security: the prompt is written to the child's STDIN, never interpolated into
 * argv or a shell — so prompt content can't inject shell commands. `shell` is
 * always false.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

// Strip ANSI escape / color codes and common CLI decorations from output.
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\[[0-9;?]*[ -/]*[@-~]/g;
export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

export interface SilentCliOptions {
  /** Binary to run, e.g. "codex" | "claude" | "gemini". */
  bin: string;
  /** Args that put the CLI into a non-interactive, pipe-friendly mode. */
  args: string[];
  /** Keep one process alive across turns to preserve conversation context. */
  persistent?: boolean;
  /** Per-turn timeout (ms). */
  timeoutMs?: number;
  /** Extra env for the child (merged over process.env). */
  env?: Record<string, string>;
  cwd?: string;
}

export class SilentCliBridge {
  private child: ChildProcessWithoutNullStreams | null = null;
  private readonly opts: Required<Pick<SilentCliOptions, "bin" | "args">> & SilentCliOptions;

  constructor(opts: SilentCliOptions) {
    this.opts = { timeoutMs: 120_000, persistent: false, ...opts };
  }

  /** True if the named binary launches at all (used by validateCredentials). */
  static async exists(bin: string): Promise<boolean> {
    return new Promise((resolveExists) => {
      const probe = spawn(bin, ["--version"], { shell: false, windowsHide: true });
      probe.on("error", () => resolveExists(false));
      probe.on("exit", (code) => resolveExists(code === 0 || code === 1));
    });
  }

  private spawnChild(): ChildProcessWithoutNullStreams {
    const child = spawn(this.opts.bin, this.opts.args, {
      shell: false, // never a shell — prompt goes via stdin, not argv
      windowsHide: true,
      cwd: this.opts.cwd,
      env: {
        ...process.env,
        ...this.opts.env,
        NO_COLOR: "1",
        TERM: "dumb",
        CI: "1", // most CLIs disable spinners/prompts under CI
      },
    });
    return child;
  }

  /**
   * Send one prompt and resolve with the cleaned stdout. Uses the persistent
   * child when enabled; otherwise spawns a fresh one-shot process.
   */
  async send(prompt: string): Promise<string> {
    if (this.opts.persistent) {
      try {
        return await this.sendPersistent(prompt);
      } catch {
        // Persistent channel broke — tear down and fall back to one-shot.
        await this.dispose();
      }
    }
    return this.oneShot(prompt);
  }

  private oneShot(prompt: string): Promise<string> {
    return new Promise((resolveSend, rejectSend) => {
      const child = this.spawnChild();
      let out = "";
      let err = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        rejectSend(new Error(`${this.opts.bin} CLI timed out after ${this.opts.timeoutMs}ms`));
      }, this.opts.timeoutMs);

      child.stdout.on("data", (d: Buffer) => (out += d.toString()));
      child.stderr.on("data", (d: Buffer) => (err += d.toString()));
      child.on("error", (e) => {
        clearTimeout(timer);
        rejectSend(new Error(`failed to launch ${this.opts.bin}: ${e.message}`));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0 && !out.trim()) {
          rejectSend(new Error(`${this.opts.bin} exited ${code}: ${stripAnsi(err).trim().slice(0, 500)}`));
          return;
        }
        resolveSend(stripAnsi(out).trim());
      });

      // Feed the prompt via stdin, then close the input stream.
      child.stdin.write(prompt);
      child.stdin.end();
    });
  }

  private ensurePersistentChild(): ChildProcessWithoutNullStreams {
    if (this.child && !this.child.killed) return this.child;
    this.child = this.spawnChild();
    this.child.on("close", () => {
      this.child = null;
    });
    return this.child;
  }

  // Persistent multi-turn: write a prompt, read until the CLI emits its
  // end-of-turn sentinel (a blank-line settle window). Best-effort context
  // preservation without re-spawning the binary every turn.
  private sendPersistent(prompt: string): Promise<string> {
    return new Promise((resolveSend, rejectSend) => {
      const child = this.ensurePersistentChild();
      let buf = "";
      let settle: NodeJS.Timeout | null = null;
      const timer = setTimeout(() => {
        cleanup();
        rejectSend(new Error(`${this.opts.bin} CLI (persistent) timed out`));
      }, this.opts.timeoutMs);

      const onData = (d: Buffer) => {
        buf += d.toString();
        if (settle) clearTimeout(settle);
        // 600ms of stdout silence = turn finished.
        settle = setTimeout(() => {
          cleanup();
          resolveSend(stripAnsi(buf).trim());
        }, 600);
      };
      const onErr = (e: Error) => {
        cleanup();
        rejectSend(e);
      };
      function cleanup() {
        clearTimeout(timer);
        if (settle) clearTimeout(settle);
        child.stdout.off("data", onData);
        child.off("error", onErr);
      }

      child.stdout.on("data", onData);
      child.once("error", onErr);
      child.stdin.write(prompt.endsWith("\n") ? prompt : prompt + "\n");
    });
  }

  async dispose(): Promise<void> {
    if (this.child && !this.child.killed) {
      try {
        this.child.stdin.end();
        this.child.kill("SIGTERM");
      } catch {
        /* already gone */
      }
    }
    this.child = null;
  }
}
