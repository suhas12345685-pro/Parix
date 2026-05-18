import type { LLMProvider, LLMRequest, LLMResponse } from "./types.js";
import { governor } from "../intelligence/governor.js";

export interface LLMRouterOptions {
  providers: LLMProvider[];
  routes?: Record<string, string[]>;
  defaultRoute?: string[];
}

export class TokenBudgetExceededError extends Error {
  estimatedTokens: number;
  taskType: string;

  constructor(taskType: string, estimatedTokens: number) {
    super(
      `Token budget exceeded for ${taskType} request (estimated ${estimatedTokens} tokens)`,
    );
    this.name = "TokenBudgetExceededError";
    this.taskType = taskType;
    this.estimatedTokens = estimatedTokens;
  }
}

export class LLMRouter {
  private providers: Map<string, LLMProvider>;
  private routes: Record<string, string[]>;
  private defaultRoute: string[];

  constructor(options: LLMRouterOptions) {
    this.providers = new Map(
      options.providers.map((provider) => [provider.id, provider]),
    );
    this.routes = options.routes ?? {};
    this.defaultRoute =
      options.defaultRoute ?? options.providers.map((provider) => provider.id);
  }

  async complete(
    request: LLMRequest,
    taskType = "reasoning",
    taskId?: string,
  ): Promise<LLMResponse> {
    const estimatedTokens = estimateRequestTokens(request);
    if (!governor.canSpend(estimatedTokens)) {
      throw new TokenBudgetExceededError(taskType, estimatedTokens);
    }

    const chain = this.chainFor(taskType);
    const errors: string[] = [];
    const requiresImages = (request.images?.length ?? 0) > 0;

    for (const providerId of chain) {
      const provider = this.providers.get(providerId);
      if (!provider || provider.enabled === false) continue;
      if (requiresImages && provider.supportsImages !== true) continue;

      try {
        const response = await provider.complete(request);
        governor.recordTokenUsage(
          provider.id,
          response.model,
          response.tokensIn,
          response.tokensOut,
          estimateCostUsd(provider.id, response.tokensIn, response.tokensOut),
          taskId,
        );
        return response;
      } catch (err) {
        errors.push(
          `${providerId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    throw new Error(
      `No LLM provider succeeded for ${taskType}: ${errors.join("; ")}`,
    );
  }

  chainFor(taskType: string): string[] {
    return this.routes[taskType] ?? this.defaultRoute;
  }
}

function estimateCostUsd(
  _provider: string,
  _tokensIn: number,
  _tokensOut: number,
): number {
  return 0;
}

function estimateRequestTokens(request: LLMRequest): number {
  const promptChars =
    request.prompt.length + (request.systemPrompt?.length ?? 0);
  const promptTokens = Math.ceil(promptChars / 4);
  return promptTokens + (request.maxTokens ?? 0);
}

export function createDefaultLLMRoutes(): Record<string, string[]> {
  return {
    reasoning: ["chatgpt", "anthropic", "openrouter", "deepseek"],
    code: ["anthropic", "chatgpt", "deepseek", "kimi", "groq"],
    search: ["perplexity", "chatgpt"],
    fast: ["groq", "chatgpt", "ollama"],
    vision: ["anthropic", "chatgpt", "openrouter"],
  };
}
