import { OpenAIAdapter, type OpenAIAdapterOptions } from "./openai.js";

export class DeepSeekAdapter extends OpenAIAdapter {
  constructor(options: OpenAIAdapterOptions = {}) {
    super({
      ...options,
      id: "deepseek",
      apiKey: options.apiKey ?? process.env.DEEPSEEK_API_KEY,
      baseURL: options.baseURL ?? "https://api.deepseek.com/v1",
      model: options.model ?? "deepseek-chat",
    });
  }
}
