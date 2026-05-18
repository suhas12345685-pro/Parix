import type { LLMProvider, LLMRequest, LLMResponse } from "../types.js";

type Fetcher = typeof fetch;

export interface AnthropicAdapterOptions {
  apiKey?: string;
  model?: string;
  fetcher?: Fetcher;
}

export class AnthropicAdapter implements LLMProvider {
  id = "anthropic";
  name = "Anthropic Claude";
  enabled: boolean;
  supportsImages = true;
  private apiKey: string | undefined;
  private model: string;
  private fetcher: Fetcher;

  constructor(options: AnthropicAdapterOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
    this.model = options.model ?? "claude-3-5-sonnet-latest";
    this.fetcher = options.fetcher ?? fetch;
    this.enabled = Boolean(this.apiKey);
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    if (!this.apiKey) throw new Error("Missing ANTHROPIC_API_KEY");

    const started = Date.now();
    const model = request.model ?? this.model;
    const userContent: Array<
      | { type: "text"; text: string }
      | {
          type: "image";
          source: { type: "base64"; media_type: string; data: string };
        }
    > =
      request.images && request.images.length > 0
        ? [
            ...request.images.map((img) => ({
              type: "image" as const,
              source: {
                type: "base64" as const,
                media_type: img.mimeType,
                data: img.base64,
              },
            })),
            { type: "text" as const, text: request.prompt },
          ]
        : [{ type: "text" as const, text: request.prompt }];

    const response = await this.fetcher(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          system: request.systemPrompt,
          messages: [{ role: "user", content: userContent }],
          temperature: request.temperature,
          max_tokens: request.maxTokens ?? 1024,
        }),
      },
    );

    if (!response.ok)
      throw new Error(`Anthropic request failed: ${response.status}`);
    const data = (await response.json()) as AnthropicResponse;
    return {
      model,
      text: data.content?.map((part) => part.text).join("") ?? "",
      tokensIn: data.usage?.input_tokens ?? 0,
      tokensOut: data.usage?.output_tokens ?? 0,
      latencyMs: Date.now() - started,
    };
  }
}

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}
