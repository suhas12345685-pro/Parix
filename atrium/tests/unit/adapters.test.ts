import { describe, expect, it, vi } from "vitest";
import {
  ClaudeAdapter,
  LMStudioAdapter,
  MistralAdapter,
  MockAdapter,
} from "../../src/llm/adapters/index.js";

describe("Codex LLM adapters", () => {
  it("mock adapter returns deterministic responses", async () => {
    const adapter = new MockAdapter({ responseText: "fixed" });

    await expect(
      adapter.complete({ prompt: "hello world" }),
    ).resolves.toMatchObject({
      text: "fixed",
      model: "mock-model",
    });
  });

  it("claude adapter targets the Anthropic messages endpoint", async () => {
    const fetcher = vi.fn(async () =>
      response({
        content: [{ type: "text", text: "ok" }],
        usage: { input_tokens: 3, output_tokens: 2 },
      }),
    );
    const adapter = new ClaudeAdapter({ apiKey: "test-key", fetcher });

    const result = await adapter.complete({
      prompt: "hello",
      systemPrompt: "system",
    });

    expect(result.text).toBe("ok");
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("mistral adapter uses the Mistral OpenAI-compatible endpoint", async () => {
    const fetcher = vi.fn(async () =>
      response({
        choices: [{ message: { content: "mistral ok" } }],
        usage: { prompt_tokens: 1, completion_tokens: 2 },
      }),
    );
    const adapter = new MistralAdapter({ apiKey: "test-key", fetcher });

    const result = await adapter.complete({ prompt: "hello" });

    expect(result.text).toBe("mistral ok");
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://api.mistral.ai/v1/chat/completions",
    );
  });

  it("lmstudio adapter points to localhost by default", async () => {
    const fetcher = vi.fn(async () =>
      response({
        choices: [{ message: { content: "local ok" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
    );
    const adapter = new LMStudioAdapter({ fetcher });

    await adapter.complete({ prompt: "hello" });

    expect(fetcher.mock.calls[0][0]).toBe(
      "http://localhost:1234/v1/chat/completions",
    );
  });
});

function response(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}
