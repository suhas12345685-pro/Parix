import type { LLMProvider, LLMRequest, LLMResponse } from "../types.js";

type Fetcher = typeof fetch;

export interface OllamaAdapterOptions {
  model?: string;
  baseURL?: string;
  fetcher?: Fetcher;
}

export class OllamaAdapter implements LLMProvider {
  id = "ollama";
  name = "Ollama";
  enabled = true;
  private model: string;
  private baseURL: string;
  private fetcher: Fetcher;

  constructor(options: OllamaAdapterOptions = {}) {
    this.model = options.model ?? process.env.OLLAMA_MODEL ?? "llama3.1";
    this.baseURL =
      options.baseURL ??
      process.env.OLLAMA_BASE_URL ??
      "http://localhost:11434";
    this.fetcher = options.fetcher ?? fetch;
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const started = Date.now();
    const model = request.model ?? this.model;
    const response = await this.fetcher(`${this.baseURL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          ...(request.systemPrompt
            ? [{ role: "system", content: request.systemPrompt }]
            : []),
          { role: "user", content: request.prompt },
        ],
        options: {
          temperature: request.temperature,
          num_predict: request.maxTokens,
        },
      }),
    });

    if (!response.ok)
      throw new Error(`Ollama request failed: ${response.status}`);
    const data = (await response.json()) as OllamaResponse;
    return {
      model,
      text: data.message?.content ?? "",
      tokensIn: data.prompt_eval_count ?? 0,
      tokensOut: data.eval_count ?? 0,
      latencyMs: Date.now() - started,
    };
  }
}

interface OllamaResponse {
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
}
