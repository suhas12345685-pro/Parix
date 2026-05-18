import { OpenAIAdapter, type OpenAIAdapterOptions } from "./openai.js";

export class GroqAdapter extends OpenAIAdapter {
  constructor(options: OpenAIAdapterOptions = {}) {
    super({
      ...options,
      id: "groq",
      apiKey: options.apiKey ?? process.env.GROQ_API_KEY,
      baseURL: options.baseURL ?? "https://api.groq.com/openai/v1",
      model: options.model ?? "llama-3.1-8b-instant",
    });
  }
}
