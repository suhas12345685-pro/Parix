import { OpenAIAdapter, type OpenAIAdapterOptions } from "./openai.js";

export class CopilotAdapter extends OpenAIAdapter {
  constructor(options: OpenAIAdapterOptions = {}) {
    super({
      ...options,
      id: "copilot",
      apiKey: options.apiKey ?? process.env.COPILOT_API_KEY,
      baseURL: options.baseURL ?? "https://api.githubcopilot.com",
      model: options.model ?? "gpt-4o-mini",
    });
  }
}
