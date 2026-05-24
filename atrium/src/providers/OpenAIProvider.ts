/**
 * OpenAIProvider — OpenAI in two modes:
 *   - "api": POST /v1/chat/completions with a standard OPENAI_API_KEY (Bearer)
 *   - "cli": pipe prompts through the official `codex` CLI, which is the
 *            sanctioned way to use a ChatGPT subscription. Codex owns its own
 *            login — we never touch its credentials.
 *
 * DELIBERATELY NOT IMPLEMENTED: a reimplemented ChatGPT PKCE/OAuth flow that
 * pools/rotates consumer ChatGPT Plus/Pro accounts to power automated agents.
 * Driving consumer ChatGPT subscriptions through a non-official client violates
 * OpenAI's terms, and account-pooling + token rotation to dodge rate limits is
 * abuse infrastructure. Use the official `codex` CLI ("cli" mode) for
 * subscription-backed access, or an API key ("api" mode) for programmatic use.
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

const DEFAULT_MODEL = "gpt-4o-mini";

export class OpenAIProvider implements IParixProvider {
  readonly id = "openai" as const;
  readonly mode: "api" | "cli";
  private apiKey?: string;
  private model: string;
  private cli?: SilentCliBridge;
  private readonly cliBinary: string;

  constructor(cfg: ProviderConfigEntry) {
    this.mode = cfg.mode;
    this.model = cfg.model ?? DEFAULT_MODEL;
    this.cliBinary = cfg.cliBinary ?? "codex";
    this.apiKey = process.env.OPENAI_API_KEY ?? cfg.apiKey;
  }

  async initialize(): Promise<void> {
    if (this.mode === "cli") {
      // `codex exec` runs a single prompt non-interactively.
      this.cli = new SilentCliBridge({ bin: this.cliBinary, args: ["exec"], timeoutMs: 180_000 });
    } else if (!this.apiKey) {
      throw new ParixProviderError(this.id, "OPENAI_API_KEY not set (api mode)");
    }
  }

  async validateCredentials(): Promise<boolean> {
    if (this.mode === "cli") return SilentCliBridge.exists(this.cliBinary);
    if (!this.apiKey) return false;
    try {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { authorization: `Bearer ${this.apiKey}` },
      });
      if (res.status === 401 || res.status === 403) return false;
      return res.ok;
    } catch {
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
      const messages: Array<{ role: string; content: string }> = [];
      if (options?.systemPrompt) messages.push({ role: "system", content: options.systemPrompt });
      messages.push({ role: "user", content: prompt });

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey!}`,
        },
        body: JSON.stringify({
          model: options?.model ?? this.model,
          messages,
          max_tokens: options?.maxTokens,
          temperature: options?.temperature,
        }),
        signal: options?.signal,
      });
      if (res.status === 401 || res.status === 403) throw new ParixAuthExpiredError(this.id);
      if (res.status === 429 || res.status >= 500) {
        throw new ParixProviderError(this.id, `transient ${res.status}`);
      }
      if (!res.ok) {
        throw new ParixProviderError(this.id, `chat/completions ${res.status}: ${(await res.text()).slice(0, 300)}`);
      }
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return data.choices?.[0]?.message?.content ?? "";
    });
  }

  async dispose(): Promise<void> {
    await this.cli?.dispose();
  }
}
