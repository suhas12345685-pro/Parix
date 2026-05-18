import { OpenAIAdapter, type OpenAIAdapterOptions } from "./openai.js";

export class GrokAdapter extends OpenAIAdapter {
  constructor(options: OpenAIAdapterOptions = {}) {
    super({
      ...options,
      id: "grok",
      apiKey: options.apiKey ?? process.env.XAI_API_KEY,
      baseURL: options.baseURL ?? "https://api.x.ai/v1",
      model: options.model ?? "grok-3-mini",
    });
  }
}
