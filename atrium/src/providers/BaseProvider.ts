/**
 * BaseProvider — the strategy interface, error types, unified config, and
 * router for Parix's multi-provider model core.
 *
 * Three providers (openai / claude / gemini), each runnable in two modes:
 *   - "api": talk to the provider's HTTPS API with a key/service account
 *   - "cli": pipe prompts through the provider's official local CLI
 *            (codex / claude / gemini) via {@link SilentCliBridge}
 *
 * Config lives in ~/.parix/config.json under the `modelProviders` key, so it
 * coexists with the rest of Parix's config without clobbering it.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

export type ProviderId = "openai" | "claude" | "gemini";
export type RuntimeMode = "api" | "cli";

export interface AgentChatOptions {
  model?: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  /** Abort the request (timeouts, orchestrator cancellation). */
  signal?: AbortSignal;
}

/** The strategy every provider implements, regardless of api/cli mode. */
export interface IParixProvider {
  readonly id: ProviderId;
  readonly mode: RuntimeMode;
  /** Load credentials/config and prepare any long-lived resources. */
  initialize(): Promise<void>;
  /** Cheap, side-effect-free check that the credentials work. */
  validateCredentials(): Promise<boolean>;
  /** Send one agent turn and return the assistant's text. */
  sendAgentChat(prompt: string, options?: AgentChatOptions): Promise<string>;
  /** Release resources (persistent CLI processes, etc.). */
  dispose?(): Promise<void>;
}

// ─── Errors ──────────────────────────────────────────────────────────────
export class ParixProviderError extends Error {
  constructor(
    public readonly providerId: ProviderId,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(`[${providerId}] ${message}`);
    this.name = "ParixProviderError";
  }
}

/** Thrown on 401/403 so the orchestrator can halt or re-auth instead of looping. */
export class ParixAuthExpiredError extends ParixProviderError {
  constructor(providerId: ProviderId, message = "credentials expired or revoked (401/403)") {
    super(providerId, message);
    this.name = "ParixAuthExpiredError";
  }
}

// ─── Config ──────────────────────────────────────────────────────────────
export interface ProviderConfigEntry {
  mode: RuntimeMode;
  /** API mode. Prefer env vars; config is the fallback. */
  apiKey?: string;
  /** Gemini API mode: path to a Google Cloud service-account JSON. */
  serviceAccountPath?: string;
  /** Default model id for this provider. */
  model?: string;
  /** CLI mode: override the binary name/path (default codex/claude/gemini). */
  cliBinary?: string;
}

export interface ModelProvidersConfig {
  default: ProviderId;
  providers: Partial<Record<ProviderId, ProviderConfigEntry>>;
}

const DEFAULT_CONFIG: ModelProvidersConfig = {
  default: "claude",
  providers: {
    openai: { mode: "api", model: "gpt-4o-mini" },
    claude: { mode: "api", model: "claude-3-5-sonnet-20240620" },
    gemini: { mode: "api", model: "gemini-1.5-flash" },
  },
};

function configPath(): string {
  const home = process.env.PARIX_HOME || resolve(homedir(), ".parix");
  return resolve(home, "config.json");
}

/** Read ~/.parix/config.json and return its `modelProviders` block (merged with defaults). */
export async function loadProvidersConfig(): Promise<ModelProvidersConfig> {
  try {
    const raw = await readFile(configPath(), "utf-8");
    const parsed = JSON.parse(raw) as { modelProviders?: ModelProvidersConfig };
    const mp = parsed.modelProviders;
    if (!mp) return DEFAULT_CONFIG;
    return {
      default: mp.default ?? DEFAULT_CONFIG.default,
      providers: { ...DEFAULT_CONFIG.providers, ...(mp.providers ?? {}) },
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

/** Persist the `modelProviders` block back into config.json without touching other keys. */
export async function saveProvidersConfig(mp: ModelProvidersConfig): Promise<void> {
  const path = configPath();
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(await readFile(path, "utf-8")) as Record<string, unknown>;
  } catch {
    /* fresh file */
  }
  existing.modelProviders = mp;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(existing, null, 2), "utf-8");
}

// ─── Retry helper (shared; Gemini uses it hardest) ─────────────────────────
/**
 * Exponential backoff with jitter for transient failures (429 / 5xx).
 * Re-throws ParixAuthExpiredError immediately (no point retrying a bad key).
 */
export async function withBackoff<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseMs?: number; maxMs?: number } = {},
): Promise<T> {
  const retries = opts.retries ?? 4;
  const baseMs = opts.baseMs ?? 400;
  const maxMs = opts.maxMs ?? 8000;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof ParixAuthExpiredError) throw err;
      lastErr = err;
      if (attempt === retries) break;
      const delay = Math.min(maxMs, baseMs * 2 ** attempt) * (0.5 + Math.random());
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

// ─── Router ────────────────────────────────────────────────────────────────
/**
 * Holds initialized providers and dispatches an agent turn to one of them.
 * Construct via {@link createProviderRouter} in index.ts.
 */
export class ProviderRouter {
  private readonly providers = new Map<ProviderId, IParixProvider>();
  constructor(
    providers: IParixProvider[],
    private defaultId: ProviderId,
  ) {
    for (const p of providers) this.providers.set(p.id, p);
    if (!this.providers.has(defaultId)) {
      const first = providers[0]?.id;
      if (!first) throw new Error("ProviderRouter: no providers supplied");
      this.defaultId = first;
    }
  }

  get(id?: ProviderId): IParixProvider {
    const provider = this.providers.get(id ?? this.defaultId);
    if (!provider) throw new Error(`ProviderRouter: unknown provider "${id}"`);
    return provider;
  }

  async sendAgentChat(
    prompt: string,
    options?: AgentChatOptions & { provider?: ProviderId },
  ): Promise<string> {
    return this.get(options?.provider).sendAgentChat(prompt, options);
  }

  async disposeAll(): Promise<void> {
    await Promise.all([...this.providers.values()].map((p) => p.dispose?.()));
  }
}
