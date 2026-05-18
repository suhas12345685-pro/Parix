import type { LLMProvider, LLMRequest, LLMResponse } from "../types.js";

export interface MockAdapterOptions {
  id?: string;
  responseText?: string;
  model?: string;
  latencyMs?: number;
  enabled?: boolean;
  failWith?: Error;
}

export class MockAdapter implements LLMProvider {
  id: string;
  name: string;
  enabled: boolean;
  private responseText: string;
  private model: string;
  private latency: number;
  private failWith: Error | undefined;

  constructor(options: MockAdapterOptions = {}) {
    this.id = options.id ?? "mock";
    this.name = "Mock LLM";
    this.enabled = options.enabled ?? true;
    this.responseText =
      options.responseText ??
      '{"action_type":"noop","confidence":1,"explanation":"mock"}';
    this.model = options.model ?? "mock-model";
    this.latency = options.latencyMs ?? 0;
    this.failWith = options.failWith;
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    if (this.failWith) throw this.failWith;
    if (this.latency > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latency));
    }

    return {
      model: request.model ?? this.model,
      text: this.responseText,
      tokensIn: estimateTokens(
        [request.systemPrompt, request.prompt].filter(Boolean).join(" "),
      ),
      tokensOut: estimateTokens(this.responseText),
      latencyMs: this.latency,
    };
  }
}

function estimateTokens(text: string): number {
  return Math.ceil(text.trim().split(/\s+/).filter(Boolean).length * 1.3);
}
