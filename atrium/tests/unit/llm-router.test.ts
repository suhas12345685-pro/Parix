import { describe, expect, it } from "vitest";
import { LLM_PROVIDER_IDS } from "../../src/llm/registry.js";
import { createDefaultLLMRoutes, LLMRouter } from "../../src/llm/router.js";
import { MockAdapter } from "../../src/llm/adapters/mock.js";

describe("LLMRouter", () => {
  it("uses the configured route for a task type", async () => {
    const router = new LLMRouter({
      providers: [
        new MockAdapter({ id: "fast", responseText: "fast response" }),
        new MockAdapter({
          id: "reasoning",
          responseText: "reasoning response",
        }),
      ],
      routes: { reasoning: ["reasoning", "fast"] },
    });

    const response = await router.complete({ prompt: "hello" });

    expect(response.model).toBe("mock-model");
    expect(response.text).toBe("reasoning response");
  });

  it("falls back when a configured provider throws", async () => {
    const router = new LLMRouter({
      providers: [
        new MockAdapter({ id: "first", failWith: new Error("boom") }),
        new MockAdapter({ id: "fallback", responseText: "ok" }),
      ],
      routes: { reasoning: ["first", "fallback"] },
    });

    await expect(router.complete({ prompt: "hello" })).resolves.toMatchObject({
      text: "ok",
    });
  });

  it("skips disabled providers", async () => {
    const router = new LLMRouter({
      providers: [
        new MockAdapter({ id: "disabled", enabled: false }),
        new MockAdapter({ id: "enabled", responseText: "live" }),
      ],
      defaultRoute: ["disabled", "enabled"],
    });

    await expect(router.complete({ prompt: "hello" })).resolves.toMatchObject({
      text: "live",
    });
  });

  it("contains the configured Parix provider roster", () => {
    expect(LLM_PROVIDER_IDS).not.toContain("gemini");
    expect(LLM_PROVIDER_IDS).toContain("anthropic");
    expect(LLM_PROVIDER_IDS).toContain("ollama");
  });

  it("includes a vision route and omits Gemini from default routes", () => {
    const routes = createDefaultLLMRoutes();

    expect(routes.vision).toBeDefined();
    expect(routes.vision!.length).toBeGreaterThan(0);
    expect(Object.values(routes).flat()).not.toContain("gemini");
  });
});
