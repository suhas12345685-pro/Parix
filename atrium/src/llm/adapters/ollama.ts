import type { LLMProvider, LLMRequest, LLMResponse } from "../types.js";
import { fetchWithTimeout } from "./fetch-timeout.js";

type Fetcher = typeof fetch;

export interface OllamaAdapterOptions {
  model?: string;
  visionModel?: string;
  baseURL?: string;
  fetcher?: Fetcher;
}

export class OllamaAdapter implements LLMProvider {
  id = "ollama";
  name = "Ollama";
  enabled = true;
  // Only advertise vision when a multimodal model is configured, so the
  // router doesn't route image requests here when Ollama is text-only.
  supportsImages: boolean;
  private model: string;
  private visionModel: string | undefined;
  private baseURL: string;
  private fetcher: Fetcher;

  constructor(options: OllamaAdapterOptions = {}) {
    this.model = options.model ?? process.env.OLLAMA_MODEL ?? "llama3.1";
    this.visionModel = options.visionModel ?? process.env.OLLAMA_VISION_MODEL;
    this.baseURL =
      options.baseURL ||
      process.env.OLLAMA_BASE_URL ||
      "http://localhost:11434";
    this.fetcher = options.fetcher ?? fetch;
    this.supportsImages = Boolean(this.visionModel);
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const started = Date.now();
    const hasImages = (request.images?.length ?? 0) > 0;
    const model =
      request.model ?? (hasImages ? this.visionModel ?? this.model : this.model);
    const userMessage: Record<string, unknown> = { role: "user", content: request.prompt };
    if (hasImages) {
      // Ollama's /api/chat takes per-message `images` as raw base64 strings.
      userMessage.images = request.images!.map((img) => img.base64);
    }
    const response = await fetchWithTimeout(this.fetcher, `${this.baseURL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          ...(request.systemPrompt
            ? [{ role: "system", content: request.systemPrompt }]
            : []),
          userMessage,
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
