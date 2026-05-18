import { OpenAIAdapter, type OpenAIAdapterOptions } from "./openai.js";

export class MistralAdapter extends OpenAIAdapter {
  constructor(options: OpenAIAdapterOptions = {}) {
    super({
      ...options,
      id: "mistral",
      apiKey: options.apiKey ?? process.env.MISTRAL_API_KEY,
      baseURL: options.baseURL ?? "https://api.mistral.ai/v1",
      model: options.model ?? "mistral-small-latest",
    });
    this.name = "Mistral";
  }
}
