import { spawn } from "node:child_process";
import type { LLMProvider, LLMRequest, LLMResponse } from "../types.js";

/**
 * CliLLMAdapter — routes a reasoning request through an official provider CLI
 * (codex / claude / gemini) instead of an HTTPS API. Registered by the registry
 * when ~/.parix/config.json marks a provider as `mode: "cli"`, so a user who
 * onboarded with "Gemini CLI" (no API key) can still power the agent's chat.
 *
 * The prompt is fed via stdin (never argv), shell is only used on Windows so the
 * npm `.cmd` shims resolve. bin/args are fixed — no injection vector.
 */
const CLI_FOR: Record<string, { bin: string; args: string[] }> = {
  google: { bin: "gemini", args: ["-p"] },
  gemini: { bin: "gemini", args: ["-p"] },
  anthropic: { bin: "claude", args: ["-p"] },
  claude: { bin: "claude", args: ["-p"] },
  chatgpt: { bin: "codex", args: ["exec"] },
  openai: { bin: "codex", args: ["exec"] },
};
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

export class CliLLMAdapter implements LLMProvider {
  id: string;
  name: string;
  enabled = true;
  supportsImages = false;
  private bin: string;
  private args: string[];

  constructor(providerId: string, opts?: { bin?: string }) {
    this.id = providerId;
    const c = CLI_FOR[providerId] ?? { bin: providerId, args: [] };
    this.bin = opts?.bin ?? c.bin;
    this.args = c.args;
    this.name = `${providerId} (CLI:${this.bin})`;
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const started = Date.now();
    const prompt = request.systemPrompt
      ? `${request.systemPrompt}\n\n${request.prompt}`
      : request.prompt;
    const text = await this.run(prompt, request.maxTokens);
    if (!text.trim()) throw new Error(`${this.bin} CLI returned empty output`);
    return { model: this.bin, text, tokensIn: 0, tokensOut: 0, latencyMs: Date.now() - started };
  }

  private run(prompt: string, maxTokens?: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.bin, this.args, {
        shell: process.platform === "win32", // resolve .cmd shims on Windows
        windowsHide: true,
        env: { ...process.env, NO_COLOR: "1", TERM: "dumb", CI: "1" },
      });
      let out = "";
      let err = "";
      const timer = setTimeout(() => {
        try {
          child.kill();
        } catch {
          /* already gone */
        }
        reject(new Error(`${this.bin} CLI timed out`));
      }, 120_000);

      child.stdout.on("data", (d: Buffer) => (out += d.toString()));
      child.stderr.on("data", (d: Buffer) => (err += d.toString()));
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(new Error(`failed to launch ${this.bin}: ${e.message}`));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        const clean = out.replace(ANSI, "").trim();
        if (code !== 0 && !clean) {
          reject(new Error(`${this.bin} exited ${code}: ${err.replace(ANSI, "").slice(0, 300)}`));
        } else {
          resolve(clean);
        }
      });

      void maxTokens; // CLI agents manage their own length
      child.stdin.write(prompt);
      child.stdin.end();
    });
  }
}
