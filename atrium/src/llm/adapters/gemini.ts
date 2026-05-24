import type { LLMProvider, LLMRequest, LLMResponse } from "../types.js";
import { fetchWithTimeout } from "./fetch-timeout.js";

type Fetcher = typeof fetch;

export interface GeminiAdapterOptions {
  apiKey?: string;
  model?: string;
  fetcher?: Fetcher;
}

/**
 * Gemini Adapter — Connects to Google's Generative AI API.
 */
export class GeminiAdapter implements LLMProvider {
  id = "google";
  name = "Google Gemini";
  enabled: boolean;
  supportsImages = true;
  private apiKey: string | undefined;
  private model: string;
  private fetcher: Fetcher;

  constructor(options: GeminiAdapterOptions = {}) {
    this.apiKey =
      options.apiKey ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
    this.model = options.model ?? "gemini-1.5-flash";
    this.fetcher = options.fetcher ?? fetch;
    this.enabled = Boolean(this.apiKey);
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    if (!this.apiKey) throw new Error("Missing GOOGLE_API_KEY");

    const started = Date.now();
    const model = request.model ?? this.model;
    
    // Gemini 1.5 format
    const contents: any[] = [];
    
    const userParts: any[] = [{ text: request.prompt }];
    if (request.images) {
      for (const img of request.images) {
        userParts.push({
          inline_data: {
            mime_type: img.mimeType,
            data: img.base64
          }
        });
      }
    }

    contents.push({ role: "user", parts: userParts });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;
    
    const body: any = { contents };
    if (request.systemPrompt) {
      body.system_instruction = { parts: [{ text: request.systemPrompt }] };
    }
    body.generationConfig = {
      temperature: request.temperature ?? 0.7,
      maxOutputTokens: request.maxTokens ?? 1024,
    };

    const response = await fetchWithTimeout(this.fetcher, url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(`Gemini request failed (${response.status}): ${JSON.stringify(errData)}`);
    }

    const data = (await response.json()) as GeminiResponse;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    if (!text) throw new Error("Gemini response had no usable content");

    return {
      model,
      text,
      tokensIn: data.usageMetadata?.promptTokenCount ?? 0,
      tokensOut: data.usageMetadata?.candidatesTokenCount ?? 0,
      latencyMs: Date.now() - started,
    };
  }
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}
