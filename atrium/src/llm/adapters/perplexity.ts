import { OpenAIAdapter, type OpenAIAdapterOptions } from "./openai.js";

export class PerplexityAdapter extends OpenAIAdapter {
  constructor(options: OpenAIAdapterOptions = {}) {
    super({
      ...options,
      id: "perplexity",
      apiKey: options.apiKey ?? process.env.PERPLEXITY_API_KEY,
      baseURL: options.baseURL ?? "https://api.perplexity.ai",
      model: options.model ?? "sonar",
    });
  }
}
