import { OpenAIAdapter, type OpenAIAdapterOptions } from "./openai.js";

export class KimiAdapter extends OpenAIAdapter {
  constructor(options: OpenAIAdapterOptions = {}) {
    super({
      ...options,
      id: "kimi",
      apiKey: options.apiKey ?? process.env.MOONSHOT_API_KEY,
      baseURL: options.baseURL ?? "https://api.moonshot.ai/v1",
      model: options.model ?? "kimi-k2-0711-preview",
    });
  }
}
