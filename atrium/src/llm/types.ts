export interface LLMImage {
  mimeType: string;
  base64: string;
}

export interface LLMRequest {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  images?: LLMImage[];
}

export interface LLMResponse {
  text: string;
  tokensIn: number;
  tokensOut: number;
  model: string;
  latencyMs: number;
}

export interface LLMProvider {
  id: string;
  name: string;
  enabled?: boolean;
  supportsImages?: boolean;
  complete(request: LLMRequest): Promise<LLMResponse>;
}
