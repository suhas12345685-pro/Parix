import { describe, expect, it } from "vitest";
import { ChannelRouter } from "../router.js";
import type { ChannelAdapter, NotificationPayload } from "../types.js";

const payload: NotificationPayload = {
  title: "Parix",
  body: "Needs attention",
  urgency: "high",
};

describe("ChannelRouter", () => {
  it("sends to the first enabled channel for the urgency tier", async () => {
    const telegram = channel("telegram", "A", true);
    const desktop = channel("desktop", "C", true);
    const router = new ChannelRouter({ channels: [telegram, desktop] });

    const sent = await router.send(payload);

    expect(sent).toBe(true);
    expect(telegram.sent).toBe(1);
    expect(desktop.sent).toBe(0);
  });

  it("falls back when the preferred channel fails", async () => {
    const telegram = channel("telegram", "A", false);
    const desktop = channel("desktop", "A", true);
    const router = new ChannelRouter({ channels: [telegram, desktop] });

    const sent = await router.send(payload);

    expect(sent).toBe(true);
    expect(telegram.sent).toBe(1);
    expect(desktop.sent).toBe(1);
  });

  it("returns false when no channel can send", async () => {
    const webhook = channel("webhook", "B", true);
    const router = new ChannelRouter({ channels: [webhook] });

    await expect(
      router.send({ ...payload, urgency: "critical" }),
    ).resolves.toBe(false);
  });
});

interface TestChannel extends ChannelAdapter {
  sent: number;
}

function channel(
  id: string,
  tier: ChannelAdapter["tier"],
  succeeds: boolean,
): TestChannel {
  return {
    id,
    name: id,
    tier,
    sent: 0,
    async send(): Promise<boolean> {
      this.sent += 1;
      return succeeds;
    },
  };
}
