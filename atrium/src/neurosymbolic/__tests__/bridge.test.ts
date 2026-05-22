import { describe, expect, it } from "vitest";
import { NeuroSymbolicBridge } from "../bridge.js";
import { NeuroSymbolicIpcClient } from "../ipc.js";

class NullIpc extends NeuroSymbolicIpcClient {
  override async request<_TPayload, TResult>(): Promise<TResult | null> {
    return null;
  }
}

describe("neuro-symbolic bridge", () => {
  it("turns a terminal module error into a policy-checked CLI action", async () => {
    const bridge = new NeuroSymbolicBridge({ ipc: new NullIpc() });
    const decision = await bridge.decide(
      {
        type: "terminal_error",
        data: { error: "Error: MODULE_NOT_FOUND", cwd: "C:/work/app" },
        confidence: 0.93,
        timestamp: Date.now() / 1000,
      },
      {
        handsStatus: "CONNECTED",
        confidence: 0.93,
        context: {},
      },
    );

    expect(decision.verdict).toBe("ALLOW");
    expect(decision.action?.kind).toBe("cli");
    expect(decision.trace.facts.some((fact) => fact.predicate === "MissingDependency")).toBe(true);
    expect(decision.trace.scores[0].score).toBeGreaterThan(0.6);
  });

  it("performs symbolic override when the candidate violates policy", async () => {
    const bridge = new NeuroSymbolicBridge({
      ipc: {
        request: async (method: string) => {
          if (method === "perceive") {
            return [
              {
                predicate: "EventType",
                args: ["terminal_error"],
                truth: 1,
                source: "python-sidecar",
              },
            ];
          }
          return [
            {
              id: "unsafe",
              kind: "cli",
              payload: { command: "git reset --hard" },
              confidence: 0.99,
              utility: 0.9,
              risk: 0.95,
              reversibility: 0.1,
              explanation: "Unsafe fix",
              capabilities: ["repo.write"],
              provenance: ["python-sidecar"],
            },
          ];
        },
      } as unknown as NeuroSymbolicIpcClient,
    });

    const decision = await bridge.decide(
      {
        type: "terminal_error",
        data: { error: "bad state" },
        confidence: 0.99,
        timestamp: Date.now() / 1000,
      },
      {
        handsStatus: "CONNECTED",
        confidence: 0.99,
        context: {},
      },
    );

    expect(decision.verdict).toBe("ASK_USER");
    expect(decision.action?.kind).toBe("notification");
    expect(decision.reason).toContain("Blocked original action");
  });
});
