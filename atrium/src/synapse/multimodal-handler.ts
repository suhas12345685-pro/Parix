/**
 * Receiver for MULTIMODAL_REQUEST messages from Hands.
 *
 * Hands sends a screenshot + prompt; we route it through the LLM router's
 * `vision` chain (multimodal providers only — see router's
 * `supportsImages` filter) and ship the resulting text back as
 * MULTIMODAL_RESPONSE. On any failure (no router, no vision-capable
 * provider, network), we still respond with `error` set so hands can
 * fall back instead of waiting on a timeout.
 */

import { EventEmitter } from "events";
import type { LLMRouter } from "../llm/router.js";

export interface MultimodalRequestMessage {
  type: "MULTIMODAL_REQUEST";
  request_id: string;
  prompt: string;
  image_b64: string;
  mime_type: string;
  timestamp?: number;
}

export interface MultimodalResponseMessage {
  type: "MULTIMODAL_RESPONSE";
  request_id: string;
  text: string;
  error: string | null;
  timestamp: number;
}

export type MultimodalSend = (msg: MultimodalResponseMessage) => void;

export interface VisualFallbackRequest {
  requestId: string;
  snapshotId: string;
  focusedApp: string;
  reason: string;
  entropy: number;
  timestamp: number;
}

export interface AccessibilityEntropyInput {
  snapshotId: string;
  focusedApp: string;
  backendUsed: string;
  confidence: number;
  treeSummary: {
    focused_element?: {
      role?: string;
      name?: string;
      value?: string | null;
      childCount?: number;
      children?: unknown[];
    } | null;
    had_raw_text?: boolean;
  };
}

const DEFAULT_PROMPT =
  "Extract all readable text from this image. Return only the text, no commentary.";
// Decoded image cap (~20 MB) — guards against forwarding huge payloads to a
// provider. base64 inflates by ~4/3, so the encoded string is larger.
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const fallbackEmitter = new EventEmitter();

function isValidBase64Image(b64: string): boolean {
  const cleaned = b64.replace(/\s+/g, "");
  if (cleaned.length === 0 || cleaned.length % 4 !== 0) return false;
  if (!BASE64_RE.test(cleaned)) return false;
  const decodedBytes = Math.floor((cleaned.length * 3) / 4);
  return decodedBytes <= MAX_IMAGE_BYTES;
}

export async function handleMultimodalRequest(
  msg: MultimodalRequestMessage,
  router: LLMRouter | null,
  send: MultimodalSend,
): Promise<void> {
  const requestId = msg.request_id;
  const respond = (text: string, error: string | null): void => {
    send({
      type: "MULTIMODAL_RESPONSE",
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
  if (!isValidBase64Image(msg.image_b64)) {
    respond("", "bad-image");
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

export function computeAccessibilityEntropy(
  snapshot: AccessibilityEntropyInput,
): number {
  const focused = snapshot.treeSummary.focused_element;
  if (!focused) return 0;

  const signals = [
    focused.role,
    focused.name,
    focused.value,
    snapshot.treeSummary.had_raw_text ? "raw_text" : "",
    ...(focused.children ?? []).slice(0, 6).map((child) => JSON.stringify(child)),
  ]
    .filter(Boolean)
    .join("|");

  const uniqueChars = new Set(signals).size;
  const childCount =
    focused.childCount ??
    (Array.isArray(focused.children) ? focused.children.length : 0);
  const structureScore = Math.min(1, childCount / 8);
  const textScore = Math.min(1, uniqueChars / 80);
  return Math.min(1, snapshot.confidence * 0.5 + structureScore * 0.25 + textScore * 0.25);
}

export function maybeRequestVisualFallback(
  snapshot: AccessibilityEntropyInput,
): VisualFallbackRequest | null {
  const entropy = computeAccessibilityEntropy(snapshot);
  const backendLooksNative =
    snapshot.backendUsed !== "vision" && snapshot.backendUsed !== "ocr";
  if (!backendLooksNative || entropy >= 0.35) return null;

  const request: VisualFallbackRequest = {
    requestId: `som-${snapshot.snapshotId}`,
    snapshotId: snapshot.snapshotId,
    focusedApp: snapshot.focusedApp,
    reason: `low_accessibility_entropy:${entropy.toFixed(2)}`,
    entropy,
    timestamp: Date.now(),
  };

  queueMicrotask(() => fallbackEmitter.emit("visual_fallback", request));
  return request;
}

export function onVisualFallbackRequest(
  listener: (request: VisualFallbackRequest) => void,
): () => void {
  fallbackEmitter.on("visual_fallback", listener);
  return () => fallbackEmitter.off("visual_fallback", listener);
}

export function _resetVisionFallbackState(): void {
  fallbackEmitter.removeAllListeners();
}
