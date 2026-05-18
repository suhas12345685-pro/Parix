import { describe, expect, it } from "vitest";
import { LLMRouter } from "../router.js";
import { createProfileAwareLLMSelection } from "../registry.js";
import type { ParixProfile } from "parix-shared";

describe("profile-aware LLM routing", () => {
  it("lets the E2E profile force the mock adapter for reasoning", async () => {
    const selection = createProfileAwareLLMSelection(
      profileWithProvider("mock"),
    );

    expect(selection.requestedProviderId).toBe("mock");
    expect(selection.selectedProviderId).toBe("mock");
    expect(selection.defaultRoute[0]).toBe("mock");
    expect(selection.routes.reasoning[0]).toBe("mock");

    const router = new LLMRouter({
      providers: selection.providers,
      routes: selection.routes,
      defaultRoute: selection.defaultRoute,
    });

    const response = await router.complete({ prompt: "hello" }, "reasoning");

    expect(response.model).toBe("mock");
    expect(response.text).toContain("mock");
  });

  it("keeps env-backed OpenAI routing working through the chatgpt adapter", () => {
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-openai-key";

    try {
      const selection = createProfileAwareLLMSelection(
        profileWithProvider("openai", "profile-openai-model"),
      );

      expect(selection.requestedProviderId).toBe("chatgpt");
      expect(selection.selectedProviderId).toBe("chatgpt");
      expect(selection.routes.reasoning[0]).toBe("chatgpt");
      expect(
        selection.providers.some((provider) => provider.id === "chatgpt"),
      ).toBe(true);
    } finally {
      if (previousOpenAiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousOpenAiKey;
      }
    }
  });
});

function profileWithProvider(
  provider: string,
  model = provider,
): Pick<ParixProfile, "llm"> {
  return {
    llm: {
      provider,
      model,
      authMethod: "local",
      authProfileId: null,
      connectionVerified: true,
      verifiedAt: "2026-05-17T00:00:00.000Z",
    },
  };
}
