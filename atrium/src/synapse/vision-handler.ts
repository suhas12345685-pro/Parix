/**
 * Receiver for VISION_OCR_REQUEST messages from Hands.
 *
 * Hands sends a screenshot + prompt; we route it through the LLM router's
 * `vision` chain (multimodal providers only — see router's
 * `supportsImages` filter) and ship the resulting text back as
 * VISION_OCR_RESPONSE. On any failure (no router, no vision-capable
 * provider, network), we still respond with `error` set so hands can
 * fall back to tesseract instead of waiting on a timeout.
 */

import type { LLMRouter } from "../llm/router.js";

export interface VisionOcrRequestMessage {
  type: "VISION_OCR_REQUEST";
  request_id: string;
  prompt: string;
  image_b64: string;
  mime_type: string;
  timestamp?: number;
}

export interface VisionOcrResponseMessage {
  type: "VISION_OCR_RESPONSE";
  request_id: string;
  text: string;
  error: string | null;
  timestamp: number;
}

export type VisionOcrSend = (msg: VisionOcrResponseMessage) => void;

const DEFAULT_PROMPT =
  "Extract all readable text from this image. Return only the text, no commentary.";

export async function handleVisionOcrRequest(
  msg: VisionOcrRequestMessage,
  router: LLMRouter | null,
  send: VisionOcrSend,
): Promise<void> {
  const requestId = msg.request_id;
  const respond = (text: string, error: string | null): void => {
    send({
      type: "VISION_OCR_RESPONSE",
      request_id: requestId,
      text,
      error,
      timestamp: Date.now() / 1000,
    });
  };

  if (!router) {
    respond("", "no-router");
    return;
  }
  if (!msg.image_b64) {
    respond("", "no-image");
    return;
  }

  try {
    const response = await router.complete(
      {
        prompt: msg.prompt || DEFAULT_PROMPT,
        images: [
          {
            mimeType: msg.mime_type || "image/png",
            base64: msg.image_b64,
          },
        ],
      },
      "vision",
    );
    respond(response.text ?? "", null);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    respond("", reason);
  }
}
