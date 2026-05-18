import { OpenAIAdapter, type OpenAIAdapterOptions } from "./openai.js";

export class BytezAdapter extends OpenAIAdapter {
  constructor(options: OpenAIAdapterOptions = {}) {
    super({
      ...options,
      id: "bytez",
      apiKey: options.apiKey ?? process.env.BYTEZ_API_KEY,
      baseURL: options.baseURL ?? "https://api.bytez.com/v1",
      model: options.model ?? "bytez/default",
    });
  }
}
