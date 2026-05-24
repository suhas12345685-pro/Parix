/**
 * ClaudeProvider — Anthropic Claude in two modes:
 *   - "api": POST /v1/messages with x-api-key + anthropic-version
 *   - "cli": pipe prompts through the official `claude` CLI (it owns its auth)
 */
import {
  type AgentChatOptions,
  type IParixProvider,
  type ProviderConfigEntry,
  ParixAuthExpiredError,
  ParixProviderError,
  withBackoff,
} from "./BaseProvider.js";
import { SilentCliBridge } from "./SilentCliBridge.js";

const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-3-5-sonnet-20240620";

export class ClaudeProvider implements IParixProvider {
  readonly id = "claude" as const;
  readonly mode: "api" | "cli";
  private apiKey?: string;
  private model: string;
  private cli?: SilentCliBridge;
  private readonly cliBinary: string;

  constructor(cfg: ProviderConfigEntry) {
    this.mode = cfg.mode;
    this.model = cfg.model ?? DEFAULT_MODEL;
    this.cliBinary = cfg.cliBinary ?? "claude";
    this.apiKey = process.env.ANTHROPIC_API_KEY ?? cfg.apiKey;
  }

  async initialize(): Promise<void> {
    if (this.mode === "cli") {
      this.cli = new SilentCliBridge({
        bin: this.cliBinary,
        args: ["-p"], // print mode: read prompt, emit answer, exit
        timeoutMs: 120_000,
        providerId: this.id,
      });
    } else if (!this.apiKey) {
      throw new ParixProviderError(this.id, "ANTHROPIC_API_KEY not set (api mode)");
    }
  }

  async validateCredentials(): Promise<boolean> {
    if (this.mode === "cli") return SilentCliBridge.exists(this.cliBinary);
    try {
      // 1-token health handshake.
      await this.callApi("ping", { maxTokens: 1 });
      return true;
    } catch (err) {
      if (err instanceof ParixAuthExpiredError) return false;
      return false;
    }
  }

  async sendAgentChat(prompt: string, options?: AgentChatOptions): Promise<string> {
    if (this.mode === "cli") {
      if (!this.cli) await this.initialize();
      return this.cli!.send(options?.systemPrompt ? `${options.systemPrompt}\n\n${prompt}` : prompt);
    }
    return this.callApi(prompt, options);
  }

  private async callApi(prompt: string, options?: AgentChatOptions): Promise<string> {
    if (!this.apiKey) throw new ParixProviderError(this.id, "missing api key");
    return withBackoff(async () => {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey!,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: options?.model ?? this.model,
          max_tokens: options?.maxTokens ?? 1024,
          temperature: options?.temperature,
          ...(options?.systemPrompt ? { system: options.systemPrompt } : {}),
          messages: [{ role: "user", content: prompt }],
        }),
        signal: options?.signal,
      });
      if (res.status === 401 || res.status === 403) throw new ParixAuthExpiredError(this.id);
      if (!res.ok) {
        throw new ParixProviderError(this.id, `messages API ${res.status}: ${(await res.text()).slice(0, 300)}`);
      }
      const data = (await res.json()) as { content?: Array<{ text?: string }> };
      return data.content?.map((c) => c.text ?? "").join("") ?? "";
    });
  }

  async dispose(): Promise<void> {
    await this.cli?.dispose();
  }
}
