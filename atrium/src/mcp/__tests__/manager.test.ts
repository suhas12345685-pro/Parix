import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod";
import { McpManager } from "../manager.js";

async function makeServer(): Promise<InMemoryTransport> {
  const server = new McpServer({ name: "test-mcp", version: "1.0.0" });
  server.registerTool(
    "echo",
    { description: "echoes the input message", inputSchema: { msg: z.string() } },
    async ({ msg }) => ({ content: [{ type: "text", text: `echo: ${msg}` }] }),
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  return clientTransport;
}

describe("McpManager", () => {
  it("connects, lists tools, and calls a tool", async () => {
    const mgr = new McpManager();
    await mgr.connectTransport("test", await makeServer());

    expect(mgr.hasTools()).toBe(true);
    const tools = mgr.listTools();
    const echo = tools.find((t) => t.name === "echo");
    expect(echo).toBeTruthy();
    expect(echo?.server).toBe("test");
    expect(mgr.catalog()).toContain("test.echo");

    const result = await mgr.callTool("test", "echo", { msg: "hello" });
    expect(result.success).toBe(true);
    expect(result.output).toContain("echo: hello");

    await mgr.closeAll();
    expect(mgr.hasTools()).toBe(false);
  });

  it("reports a clear error for an unknown server", async () => {
    const mgr = new McpManager();
    const result = await mgr.callTool("nope", "x", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("unknown MCP server");
  });
});
