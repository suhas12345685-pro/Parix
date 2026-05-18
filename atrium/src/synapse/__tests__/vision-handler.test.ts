import { describe, expect, it, vi } from "vitest";
import {
  handleVisionOcrRequest,
  type VisionOcrResponseMessage,
} from "../vision-handler.js";
import { LLMRouter } from "../../llm/router.js";
import type { LLMProvider } from "../../llm/types.js";

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    type: "VISION_OCR_REQUEST" as const,
    request_id: "req-1",
    prompt: "Extract text",
    image_b64: "AAAA",
    mime_type: "image/png",
    timestamp: 1,
    ...overrides,
  };
}

describe("handleVisionOcrRequest", () => {
  it("responds with error=no-router when no router is registered", async () => {
    const send = vi.fn<(msg: VisionOcrResponseMessage) => void>();
    await handleVisionOcrRequest(makeRequest(), null, send);

    expect(send).toHaveBeenCalledTimes(1);
    const response = send.mock.calls[0][0];
    expect(response.type).toBe("VISION_OCR_RESPONSE");
    expect(response.request_id).toBe("req-1");
    expect(response.error).toBe("no-router");
    expect(response.text).toBe("");
  });

  it("responds with error=no-image when image_b64 is empty", async () => {
    const router = new LLMRouter({ providers: [] });
    const send = vi.fn<(msg: VisionOcrResponseMessage) => void>();
    await handleVisionOcrRequest(
      makeRequest({ image_b64: "" }),
      router,
      send,
    );

    expect(send.mock.calls[0][0].error).toBe("no-image");
  });

  it("routes through the vision chain and returns text on success", async () => {
    const vision: LLMProvider = {
      id: "vision-ok",
      name: "vision-ok",
      enabled: true,
      supportsImages: true,
      async complete(request) {
        expect(request.images).toHaveLength(1);
        expect(request.images?.[0].mimeType).toBe("image/png");
        return {
          model: "vision-ok",
          text: "extracted text",
          tokensIn: 0,
          tokensOut: 0,
          latencyMs: 1,
        };
      },
    };
    const router = new LLMRouter({
      providers: [vision],
      routes: { vision: ["vision-ok"] },
    });
    const send = vi.fn<(msg: VisionOcrResponseMessage) => void>();

    await handleVisionOcrRequest(makeRequest(), router, send);

    const response = send.mock.calls[0][0];
    expect(response.error).toBeNull();
    expect(response.text).toBe("extracted text");
    expect(response.request_id).toBe("req-1");
  });

  it("returns the router error message when no vision-capable provider exists", async () => {
    const textOnly: LLMProvider = {
      id: "text-only",
      name: "text-only",
      enabled: true,
      async complete() {
        throw new Error("should not be called");
      },
    };
    const router = new LLMRouter({
      providers: [textOnly],
      routes: { vision: ["text-only"] },
    });
    const send = vi.fn<(msg: VisionOcrResponseMessage) => void>();

    await handleVisionOcrRequest(makeRequest(), router, send);

    const response = send.mock.calls[0][0];
    expect(response.text).toBe("");
    expect(response.error).toMatch(/No LLM provider succeeded/);
  });
});
