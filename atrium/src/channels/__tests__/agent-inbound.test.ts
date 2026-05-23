import { describe, it, expect, beforeEach, vi } from "vitest";
import { registerChannel, unregisterChannel } from "../../intelligence/notify.js";
import { emitInboundMessage } from "../inbound.js";
import { startInboundAgent } from "../agent-inbound.js";
import type { AtriumEngine } from "../../intelligence/council.js";

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

describe("inbound agent pipeline", () => {
  const replies: string[] = [];

  beforeEach(() => {
    replies.length = 0;
    registerChannel({
      id: "test-chan",
      name: "Test",
      tier: "A",
      async send() {
        return true;
      },
      async reply(_chatId, text) {
        replies.push(text);
        return true;
      },
    });
  });

  it("acts on an inbound message and replies with ack + outcome", async () => {
    const runUserRequest = vi.fn().mockResolvedValue({
      acted: true,
      success: true,
      output: "notification_dispatched",
      reasoning: "User request: send a reminder",
    });
    const engine = { runUserRequest } as unknown as AtriumEngine;

    startInboundAgent(engine);

    emitInboundMessage({
      channelId: "test-chan",
      chatId: "42",
      senderId: "42",
      text: "send me a reminder",
      timestamp: Date.now(),
    });

    // Let the ack + async runUserRequest + reply settle.
    await flush();
    await flush();

    expect(runUserRequest).toHaveBeenCalledWith("send me a reminder");
    expect(replies[0]).toContain("On it");
    expect(replies[1]).toContain("Done");
    unregisterChannel("test-chan");
  });
});
