import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, unlinkSync } from "fs";
import { dirname, resolve } from "path";
import { LLM_PROVIDER_IDS } from "../registry.js";
import {
  createDefaultLLMRoutes,
  LLMRouter,
  TokenBudgetExceededError,
} from "../router.js";
import { closeDb, initDb } from "../../memory/db.js";
import { recordTokenUsage } from "../../intelligence/token-governor.js";
import type { LLMProvider, LLMRequest, LLMResponse } from "../types.js";

const request: LLMRequest = {
  prompt: "hello",
};

describe("LLMRouter", () => {
  it("uses the configured route for a task type", async () => {
    const fast = provider("fast-model", true, "fast response");
    const slow = provider("slow-model", true, "slow response");
    const router = new LLMRouter({
      providers: [fast, slow],
      routes: { reasoning: ["slow-model", "fast-model"] },
    });

    const response = await router.complete(request);

    expect(response.model).toBe("slow-model");
    expect(response.text).toBe("slow response");
  });

  it("falls back when a configured provider fails", async () => {
    const failing = provider("first", true, "unused", true);
    const fallback = provider("fallback", true, "ok");
    const router = new LLMRouter({
      providers: [failing, fallback],
      routes: { reasoning: ["first", "fallback"] },
    });

    const response = await router.complete(request);

    expect(response.model).toBe("fallback");
  });

  it("skips disabled providers", async () => {
    const disabled = provider("disabled", false, "unused");
    const enabled = provider("enabled", true, "ok");
    const router = new LLMRouter({
      providers: [disabled, enabled],
      defaultRoute: ["disabled", "enabled"],
    });

    const response = await router.complete(request);

    expect(response.model).toBe("enabled");
  });

  it("blocks provider calls when the token budget is exhausted", async () => {
    const dbPath = resolve(__dirname, "router-budget-test.db");
    mkdirSync(dirname(dbPath), { recursive: true });
    if (existsSync(dbPath)) unlinkSync(dbPath);
    await initDb(dbPath);

    recordTokenUsage("probe", "probe", 100_000, 1);
    let calls = 0;
    const expensive = provider("expensive", true, "should not run");
    expensive.complete = async (): Promise<LLMResponse> => {
      calls++;
      return {
        model: "expensive",
        text: "should not run",
        tokensIn: 1,
        tokensOut: 1,
        latencyMs: 1,
      };
    };

    const router = new LLMRouter({ providers: [expensive] });

    await expect(
      router.complete({ prompt: "hello", maxTokens: 10 }),
    ).rejects.toBeInstanceOf(TokenBudgetExceededError);
    expect(calls).toBe(0);

    closeDb();
    if (existsSync(dbPath)) unlinkSync(dbPath);
  });

  it("contains the configured Parix provider roster", () => {
    expect(LLM_PROVIDER_IDS).toEqual([
      "chatgpt",
      "anthropic",
      "grok",
      "openrouter",
      "groq",
      "bytez",
      "perplexity",
      "kimi",
      "ollama",
      "deepseek",
    ]);
  });

  it("defines a vision route and excludes Gemini from defaults", () => {
    const routes = createDefaultLLMRoutes();

    expect(routes.vision).toBeDefined();
    expect(routes.vision!.length).toBeGreaterThan(0);
    expect(Object.values(routes).flat()).not.toContain("gemini");
  });

  it("skips text-only providers when the request carries images", async () => {
    const textOnly = provider("text-only", true, "should not run");
    let textOnlyCalls = 0;
    textOnly.complete = async () => {
      textOnlyCalls++;
      return {
        model: "text-only",
        text: "nope",
        tokensIn: 0,
        tokensOut: 0,
        latencyMs: 1,
      };
    };
    const vision = provider("vision-capable", true, "saw it");
    vision.supportsImages = true;

    const router = new LLMRouter({
      providers: [textOnly, vision],
      routes: { vision: ["text-only", "vision-capable"] },
    });

    const response = await router.complete(
      {
        prompt: "what is in this image",
        images: [{ mimeType: "image/png", base64: "AAAA" }],
      },
      "vision",
    );

    expect(textOnlyCalls).toBe(0);
    expect(response.model).toBe("vision-capable");
    expect(response.text).toBe("saw it");
  });

  it("throws when no provider in the chain supports images", async () => {
    const textOnly = provider("text-only", true, "nope");
    const router = new LLMRouter({
      providers: [textOnly],
      routes: { vision: ["text-only"] },
    });

    await expect(
      router.complete(
        {
          prompt: "describe",
          images: [{ mimeType: "image/png", base64: "AAAA" }],
        },
        "vision",
      ),
    ).rejects.toThrow(/No LLM provider succeeded/);
  });
});

function provider(
  id: string,
  enabled: boolean,
  content: string,
  fail = false,
): LLMProvider {
  return {
    id,
    name: id,
    enabled,
    async complete(): Promise<LLMResponse> {
      if (fail) throw new Error("boom");
      return {
        model: id,
        text: content,
        tokensIn: 0,
        tokensOut: 0,
        latencyMs: 1,
      };
    },
  };
}
