import { OpenAIAdapter, type OpenAIAdapterOptions } from "./openai.js";

export class LMStudioAdapter extends OpenAIAdapter {
  constructor(options: OpenAIAdapterOptions = {}) {
    super({
      ...options,
      id: "lmstudio",
      apiKey: options.apiKey ?? process.env.LMSTUDIO_API_KEY ?? "lm-studio",
      baseURL:
        options.baseURL ??
        process.env.LMSTUDIO_BASE_URL ??
        "http://localhost:1234/v1",
      model: options.model ?? process.env.LMSTUDIO_MODEL ?? "local-model",
    });
    this.name = "LM Studio";
    this.enabled = true;
  }
}
