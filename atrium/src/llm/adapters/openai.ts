import type { LLMProvider, LLMRequest, LLMResponse } from "../types.js";

type Fetcher = typeof fetch;

export interface OpenAIAdapterOptions {
  id?: string;
  apiKey?: string;
  model?: string;
  baseURL?: string;
  fetcher?: Fetcher;
}

export class OpenAIAdapter implements LLMProvider {
  id: string;
  name: string;
  enabled: boolean;
  supportsImages = true;
  protected apiKey: string | undefined;
  protected model: string;
  protected baseURL: string;
  protected fetcher: Fetcher;

  constructor(options: OpenAIAdapterOptions = {}) {
    this.id = options.id ?? "openai";
    this.name = this.id === "openai" ? "OpenAI" : this.id;
    this.apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    this.model = options.model ?? "gpt-4o-mini";
    this.baseURL = options.baseURL ?? "https://api.openai.com/v1";
    this.fetcher = options.fetcher ?? fetch;
    this.enabled = Boolean(this.apiKey);
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    if (!this.apiKey) throw new Error(`Missing API key for ${this.id}`);

    const started = Date.now();
    const model = request.model ?? this.model;
    const userContent: unknown =
      request.images && request.images.length > 0
        ? [
            { type: "text", text: request.prompt },
            ...request.images.map((img) => ({
              type: "image_url",
              image_url: {
                url: `data:${img.mimeType};base64,${img.base64}`,
              },
            })),
          ]
        : request.prompt;

    const response = await this.fetcher(`${this.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          ...(request.systemPrompt
            ? [{ role: "system", content: request.systemPrompt }]
            : []),
          { role: "user", content: userContent },
        ],
        temperature: request.temperature,
        max_tokens: request.maxTokens,
      }),
    });

    if (!response.ok)
      throw new Error(`${this.id} request failed: ${response.status}`);
    const data = (await response.json()) as OpenAIResponse;
    return {
      model,
      text: data.choices?.[0]?.message?.content ?? "",
      tokensIn: data.usage?.prompt_tokens ?? 0,
      tokensOut: data.usage?.completion_tokens ?? 0,
      latencyMs: Date.now() - started,
    };
  }
}

export class ChatGPTAdapter extends OpenAIAdapter {
  constructor(options: OpenAIAdapterOptions = {}) {
    super({
      ...options,
      id: "chatgpt",
      apiKey: options.apiKey ?? process.env.OPENAI_API_KEY,
      baseURL: options.baseURL ?? "https://api.openai.com/v1",
      model: options.model ?? "gpt-4o-mini",
    });
  }
}

interface OpenAIResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}
