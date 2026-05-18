import { AnthropicAdapter, type AnthropicAdapterOptions } from "./anthropic.js";

export class ClaudeAdapter extends AnthropicAdapter {
  constructor(options: AnthropicAdapterOptions = {}) {
    super(options);
    this.id = "claude";
    this.name = "Claude";
  }
}
