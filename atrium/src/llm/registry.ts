import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import type { LLMProvider } from "./types.js";
import {
  AnthropicAdapter,
  ChatGPTAdapter,
  CliLLMAdapter,
  GeminiAdapter,
  GrokAdapter,
  GroqAdapter,
  KimiAdapter,
  LMStudioAdapter,
  MistralAdapter,
  MockAdapter,
  OllamaAdapter,
  OpenRouterAdapter,
} from "./adapters/index.js";
import { createDefaultLLMRoutes } from "./router.js";
import type { ParixProfile } from "parix-shared";

// modelProviders id (config.json) -> atrium provider id
const CORE_TO_ATRIUM: Record<string, string> = {
  openai: "chatgpt",
  claude: "anthropic",
  gemini: "google",
};

/**
 * Read ~/.parix/config.json and return CLI-backed adapters for any provider
 * marked `mode: "cli"`, so a CLI-onboarded user (no API key) still has a working
 * reasoning provider. Best-effort: returns [] if the file is missing/invalid.
 */
function readCliAdapters(): LLMProvider[] {
  try {
    const home = process.env.PARIX_HOME || resolve(homedir(), ".parix");
    const cfg = JSON.parse(readFileSync(resolve(home, "config.json"), "utf-8")) as {
      modelProviders?: { providers?: Record<string, { mode?: string; cliBinary?: string }> };
    };
    const mp = cfg.modelProviders?.providers ?? {};
    const adapters: LLMProvider[] = [];
    for (const [coreId, entry] of Object.entries(mp)) {
      const atriumId = CORE_TO_ATRIUM[coreId];
      if (entry?.mode === "cli" && atriumId) {
        adapters.push(new CliLLMAdapter(atriumId, { bin: entry.cliBinary }));
      }
    }
    return adapters;
  } catch {
    return [];
  }
}

export function createDefaultLLMProviders(): LLMProvider[] {
  return [
    new ChatGPTAdapter(),
    new AnthropicAdapter(),
    new GeminiAdapter(),
    new GrokAdapter(),
    new OpenRouterAdapter(),
    new GroqAdapter(),
    new KimiAdapter(),
    new OllamaAdapter(),
  ];
}

export const LLM_PROVIDER_IDS = [
  "chatgpt",
  "anthropic",
  "google",
  "grok",
  "openrouter",
  "groq",
  "kimi",
  "ollama",
] as const;

export type LLMProviderId = (typeof LLM_PROVIDER_IDS)[number];

export interface ProfileAwareLLMSelection {
  providers: LLMProvider[];
  routes: Record<string, string[]>;
  defaultRoute: string[];
  requestedProviderId: string | null;
  selectedProviderId: string | null;
}

export function createProfileAwareLLMSelection(
  profile?: Pick<ParixProfile, "llm"> | null,
): ProfileAwareLLMSelection {
  const requestedProviderId = normalizeProfileProviderId(profile?.llm.provider);
  const selectedProvider = requestedProviderId
    ? createProviderForId(requestedProviderId, profile?.llm.model)
    : null;

  // CLI-backed adapters go first so they win dedup over the API adapter of the
  // same id (e.g. a "google (CLI)" provider beats the key-less GeminiAdapter).
  const cliAdapters = readCliAdapters();
  const providers = dedupeProviders([
    ...cliAdapters,
    ...(selectedProvider ? [selectedProvider] : []),
    ...createDefaultLLMProviders(),
  ]).filter((provider) => provider.enabled !== false);

  const selectedProviderId =
    selectedProvider &&
    providers.some((provider) => provider.id === selectedProvider.id)
      ? selectedProvider.id
      : null;
  const providerIds = providers.map((provider) => provider.id);
  const defaultRoute = selectedProviderId
    ? prioritizeProvider(providerIds, selectedProviderId)
    : providerIds;
  const routes = selectedProviderId
    ? prioritizeRoutes(createDefaultLLMRoutes(), selectedProviderId)
    : createDefaultLLMRoutes();

  return {
    providers,
    routes,
    defaultRoute,
    requestedProviderId,
    selectedProviderId,
  };
}

function createProviderForId(
  providerId: string,
  model?: string,
): LLMProvider | null {
  switch (providerId) {
    case "mock":
      return new MockAdapter({ model: model || "mock" });
    case "chatgpt":
      return new ChatGPTAdapter({ model });
    case "anthropic":
      return new AnthropicAdapter({ model });
    case "google":
      return new GeminiAdapter({ model });
    case "grok":
      return new GrokAdapter({ model });
    case "openrouter":
      return new OpenRouterAdapter({ model });
    case "groq":
      return new GroqAdapter({ model });
    case "kimi":
      return new KimiAdapter({ model });
    case "ollama":
      return new OllamaAdapter({ model });
    case "mistral":
      return new MistralAdapter({ model });
    case "lmstudio":
      return new LMStudioAdapter({ model });
    default:
      return null;
  }
}

function normalizeProfileProviderId(providerId: unknown): string | null {
  if (typeof providerId !== "string") return null;
  const normalized = providerId.trim().toLowerCase();
  if (!normalized) return null;

  if (normalized === "openai") return "chatgpt";
  if (normalized === "claude") return "anthropic";
  return normalized;
}

function dedupeProviders(providers: LLMProvider[]): LLMProvider[] {
  const seen = new Set<string>();
  const deduped: LLMProvider[] = [];

  for (const provider of providers) {
    if (seen.has(provider.id)) continue;
    seen.add(provider.id);
    deduped.push(provider);
  }

  return deduped;
}

function prioritizeRoutes(
  routes: Record<string, string[]>,
  providerId: string,
): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(routes).map(([taskType, chain]) => [
      taskType,
      prioritizeProvider(chain, providerId),
    ]),
  );
}

function prioritizeProvider(chain: string[], providerId: string): string[] {
  return [providerId, ...chain.filter((id) => id !== providerId)];
}
