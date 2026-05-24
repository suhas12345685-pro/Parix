/**
 * GeminiProvider — Google Gemini in two modes:
 *   - "api": generateContent via either GEMINI_API_KEY (?key=) or a Google
 *            Cloud service-account JSON (Bearer token via google-auth-library,
 *            lazily imported so it's not a hard dependency). Wrapped in
 *            exponential backoff to ride out aggressive 429s during
 *            high-frequency tool calling.
 *   - "cli": pipe prompts through the official `gemini` CLI.
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

const DEFAULT_MODEL = "gemini-1.5-flash";

export class GeminiProvider implements IParixProvider {
  readonly id = "gemini" as const;
  readonly mode: "api" | "cli";
  private apiKey?: string;
  private serviceAccountPath?: string;
  private model: string;
  private cli?: SilentCliBridge;
  private readonly cliBinary: string;
  private cachedToken?: { token: string; expiresAt: number };

  constructor(cfg: ProviderConfigEntry) {
    this.mode = cfg.mode;
    this.model = cfg.model ?? DEFAULT_MODEL;
    this.cliBinary = cfg.cliBinary ?? "gemini";
    this.apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? cfg.apiKey;
    this.serviceAccountPath =
      process.env.GDRIVE_SERVICE_ACCOUNT_JSON ?? cfg.serviceAccountPath;
  }

  async initialize(): Promise<void> {
    if (this.mode === "cli") {
      this.cli = new SilentCliBridge({ bin: this.cliBinary, args: ["-p"], timeoutMs: 120_000, providerId: this.id });
    } else if (!this.apiKey && !this.serviceAccountPath) {
      throw new ParixProviderError(this.id, "no GEMINI_API_KEY or service-account path (api mode)");
    }
  }

  async validateCredentials(): Promise<boolean> {
    if (this.mode === "cli") return SilentCliBridge.exists(this.cliBinary);
    try {
      await this.callApi("ping", { maxTokens: 1 });
      return true;
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

  /** Mint (and cache) a service-account access token via google-auth-library. */
  private async serviceAccountToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt - 60_000 > Date.now()) {
      return this.cachedToken.token;
    }
    // Optional dependency: use a non-literal specifier so tsc treats the import
    // as `any` and doesn't require google-auth-library at compile time.
    const moduleName = "google-auth-library";
    let mod: any;
    try {
      mod = await import(moduleName);
    } catch {
      throw new ParixProviderError(this.id, "service-account mode needs: npm i google-auth-library");
    }
    const auth = new mod.GoogleAuth({
      keyFile: this.serviceAccountPath,
      scopes: ["https://www.googleapis.com/auth/generative-language"],
    });
    const client = await auth.getClient();
    const tok = await client.getAccessToken();
    const token = typeof tok === "string" ? tok : tok?.token;
    if (!token) throw new ParixAuthExpiredError(this.id, "service account returned no token");
    this.cachedToken = { token, expiresAt: Date.now() + 50 * 60_000 };
    return token;
  }

  private async callApi(prompt: string, options?: AgentChatOptions): Promise<string> {
    const model = options?.model ?? this.model;
    return withBackoff(
      async () => {
        const body = {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          ...(options?.systemPrompt
            ? { system_instruction: { parts: [{ text: options.systemPrompt }] } }
            : {}),
          generationConfig: {
            temperature: options?.temperature ?? 0.7,
            maxOutputTokens: options?.maxTokens ?? 1024,
          },
        };

        const headers: Record<string, string> = { "content-type": "application/json" };
        let url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
        if (this.serviceAccountPath) {
          headers.authorization = `Bearer ${await this.serviceAccountToken()}`;
        } else if (this.apiKey) {
          url += `?key=${encodeURIComponent(this.apiKey)}`;
        } else {
          throw new ParixProviderError(this.id, "no credentials");
        }

        const res = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: options?.signal,
        });
        if (res.status === 401 || res.status === 403) throw new ParixAuthExpiredError(this.id);
        if (res.status === 429 || res.status >= 500) {
          // Let withBackoff retry transient throttling / server errors.
          throw new ParixProviderError(this.id, `transient ${res.status}`);
        }
        if (!res.ok) {
          throw new ParixAuthExpiredError(this.id, `generateContent ${res.status}: ${(await res.text()).slice(0, 200)}`);
        }
        const data = (await res.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      },
      { retries: 5, baseMs: 500, maxMs: 12_000 },
    );
  }

  async dispose(): Promise<void> {
    await this.cli?.dispose();
  }
}
