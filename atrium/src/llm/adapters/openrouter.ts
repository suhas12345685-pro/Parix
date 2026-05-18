import { OpenAIAdapter, type OpenAIAdapterOptions } from "./openai.js";

export class OpenRouterAdapter extends OpenAIAdapter {
  constructor(options: OpenAIAdapterOptions = {}) {
    super({
      ...options,
      id: "openrouter",
      apiKey: options.apiKey ?? process.env.OPENROUTER_API_KEY,
      baseURL: options.baseURL ?? "https://openrouter.ai/api/v1",
      model: options.model ?? "openrouter/auto",
    });
  }
}
