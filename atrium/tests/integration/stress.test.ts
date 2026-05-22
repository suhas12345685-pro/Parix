import { describe, it, expect, vi } from "vitest";
import { Debouncer } from "../../src/queue/debouncer.js";
import { LLMRouter } from "../../src/llm/router.js";
import { MockAdapter } from "../../src/llm/adapters/mock.js";
import { SynapseClient } from "../../src/synapse/client.js";
import { WebSocketServer } from "ws";

describe("Day 7 - Pass 4 Stress Tests", () => {
  
  describe("Debouncer Stress", () => {
    it("100 SENSOR_EVENTs in 1s -> debouncer collapses to <=5 unique events", async () => {
      vi.useFakeTimers();
      let flushedCount = 0;
      
      const debouncer = new Debouncer<{ type: string }>({
        windowMs: 5000,
        onFlush: () => { flushedCount++; }
      });

      // Fire 100 events in 1s (10ms apart)
      for (let i = 0; i < 100; i++) {
        debouncer.push({ type: "terminal_error" });
        await vi.advanceTimersByTimeAsync(10);
      }
      
      await vi.advanceTimersByTimeAsync(6000); // let window expire
      expect(flushedCount).toBeLessThanOrEqual(5);
      
      vi.useRealTimers();
    });
  });

  describe("LLM Fallback Chain Stress", () => {
    it("Gemini rate-limited -> fallback to Groq -> fallback to mock", async () => {
      const gemini = new MockAdapter({ id: "gemini", failWith: new Error("Rate limit 429") });
      const groq = new MockAdapter({ id: "groq", failWith: new Error("500 Server error") });
      const mock = new MockAdapter({ id: "mock", responseText: '{"action_type":"cli", "command": "echo mock"}' });

      const router = new LLMRouter({
        providers: [gemini, groq, mock],
        routes: {
          reasoning: ["gemini", "groq", "mock"]
        }
      });

      const res = await router.complete({ prompt: "Fix this error" }, "reasoning");
      
      // We expect the mock to succeed after both failed
      expect(res.text).toContain("echo mock");
    });
  });

  describe("Crash Recovery Stress", () => {
    let wss: WebSocketServer | null = null;
    const TEST_PORT = 8762;
    
    function startServer(): Promise<void> {
      return new Promise((resolve) => {
        wss = new WebSocketServer({ port: TEST_PORT }, () => resolve());
      });
    }

    function stopServer(): Promise<void> {
      return new Promise((resolve) => {
        if (!wss) return resolve();
        wss.clients.forEach((c) => c.close());
        wss.close(() => {
          wss = null;
          resolve();
        });
      });
    }

    it("survives 20 python kill/restart cycles without zombie states", async () => {
      const synapse = new SynapseClient(TEST_PORT);
      // Suppress console logs during test to keep output clean
      const originalConsoleError = console.error;
      const originalConsoleLog = console.log;
      console.error = () => {};
      console.log = () => {};

      try {
        synapse.connect();
        
        for (let i = 0; i < 20; i++) {
          await startServer();
          await new Promise<void>((r) => {
            if (synapse.getStatus() === "CONNECTED") return r();
            const handler = (state: string) => { 
              if (state === "CONNECTED") { synapse.off("state_change", handler); r(); } 
            };
            synapse.on("state_change", handler);
          });

          await stopServer();
          await new Promise<void>((r) => {
            if (synapse.getStatus() === "DISCONNECTED") return r();
            const handler = (state: string) => { 
              if (state === "DISCONNECTED") { synapse.off("state_change", handler); r(); } 
            };
            synapse.on("state_change", handler);
          });
        }
      } finally {
        console.error = originalConsoleError;
        console.log = originalConsoleLog;
        synapse.disconnect();
        if (wss) await stopServer();
      }
    }, 15000); // 15 seconds timeout
  });

});
