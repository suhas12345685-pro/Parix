import type { LLMProvider } from "./types.js";
import {
  AnthropicAdapter,
  BytezAdapter,
  ChatGPTAdapter,
  CopilotAdapter,
  DeepSeekAdapter,
  GrokAdapter,
  GroqAdapter,
  KimiAdapter,
  LMStudioAdapter,
  MistralAdapter,
  MockAdapter,
  OllamaAdapter,
  OpenRouterAdapter,
  PerplexityAdapter,
} from "./adapters/index.js";
import { createDefaultLLMRoutes } from "./router.js";
import type { ParixProfile } from "parix-shared";

export function createDefaultLLMProviders(): LLMProvider[] {
  return [
    new ChatGPTAdapter(),
    new AnthropicAdapter(),
    new GrokAdapter(),
    new OpenRouterAdapter(),
    new GroqAdapter(),
    new BytezAdapter(),
    new PerplexityAdapter(),
    new KimiAdapter(),
    new OllamaAdapter(),
    new DeepSeekAdapter(),
  ];
}

export const LLM_PROVIDER_IDS = [
  "chatgpt",
  "anthropic",
  "grok",
  "openrouter",
  "groq",
  "bytez",
  "perplexity",
  "kimi",
  "ollama",
  "deepseek",
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

  const providers = dedupeProviders([
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
    case "grok":
      return new GrokAdapter({ model });
    case "openrouter":
      return new OpenRouterAdapter({ model });
    case "groq":
      return new GroqAdapter({ model });
    case "bytez":
      return new BytezAdapter({ model });
    case "perplexity":
      return new PerplexityAdapter({ model });
    case "kimi":
      return new KimiAdapter({ model });
    case "ollama":
      return new OllamaAdapter({ model });
    case "deepseek":
      return new DeepSeekAdapter({ model });
    case "mistral":
      return new MistralAdapter({ model });
    case "copilot":
      return new CopilotAdapter({ model });
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
