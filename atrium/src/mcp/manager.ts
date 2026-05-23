/**
 * MCP client manager.
 *
 * Connects Parix to external MCP (Model Context Protocol) servers so the agent
 * can call their tools — filesystem, browser, APIs, etc. Servers are declared
 * in mcp.servers.json; each is connected at boot, its tools are cached, and the
 * engine dispatches an `mcp` task to call a tool by {server, tool, args}.
 */
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

export interface McpServerConfig {
  transport: "stdio" | "http";
  /** stdio: executable + args + extra env */
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  /** http: streamable-HTTP endpoint URL */
  url?: string;
  enabled?: boolean;
}

export interface McpToolInfo {
  server: string;
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface McpCallResult {
  success: boolean;
  output: string;
  error?: string;
}

export class McpManager {
  private clients = new Map<string, Client>();
  private tools: McpToolInfo[] = [];

  /** Connect every enabled server from a config map; failures are logged, not thrown. */
  async connect(configs: Record<string, McpServerConfig>): Promise<void> {
    for (const [name, config] of Object.entries(configs ?? {})) {
      if (config.enabled === false) continue;
      try {
        const transport = buildTransport(config);
        await this.connectTransport(name, transport);
        console.log(
          `[MCP] Connected "${name}" (${config.transport}) — ${this.toolsFor(name).length} tool(s)`,
        );
      } catch (err) {
        console.error(
          `[MCP] Failed to connect "${name}": ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }

  /** Connect a single server over a pre-built transport (also used by tests). */
  async connectTransport(name: string, transport: Transport): Promise<void> {
    const client = new Client(
      { name: "parix-atrium", version: "0.2.0" },
      { capabilities: {} },
    );
    await client.connect(transport);
    this.clients.set(name, client);

    const listed = await client.listTools();
    for (const tool of listed.tools ?? []) {
      this.tools.push({
        server: name,
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      });
    }
  }

  listTools(): McpToolInfo[] {
    return this.tools;
  }

  toolsFor(server: string): McpToolInfo[] {
    return this.tools.filter((t) => t.server === server);
  }

  hasTools(): boolean {
    return this.tools.length > 0;
  }

  /** A compact catalog string for injecting into the planner prompt. */
  catalog(): string {
    if (this.tools.length === 0) return "";
    return this.tools
      .map(
        (t) =>
          `- ${t.server}.${t.name}${t.description ? `: ${t.description}` : ""}`,
      )
      .join("\n");
  }

  async callTool(
    server: string,
    tool: string,
    args: Record<string, unknown> = {},
  ): Promise<McpCallResult> {
    const client = this.clients.get(server);
    if (!client) {
      return { success: false, output: "", error: `unknown MCP server: ${server}` };
    }
    try {
      const result = await client.callTool({ name: tool, arguments: args });
      const text = extractText(result);
      const isError = (result as { isError?: boolean }).isError === true;
      return {
        success: !isError,
        output: text,
        error: isError ? text || "tool reported an error" : undefined,
      };
    } catch (err) {
      return {
        success: false,
        output: "",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async closeAll(): Promise<void> {
    for (const client of this.clients.values()) {
      try {
        await client.close();
      } catch {
        // best-effort
      }
    }
    this.clients.clear();
    this.tools = [];
  }
}

/**
 * Load MCP server declarations from `<root>/mcp.servers.json` (or the path in
 * PARIX_MCP_CONFIG). Shape: { "servers": { "<name>": { transport, ... } } }.
 * Missing/invalid file → empty map (no servers, no crash).
 */
export function loadMcpConfig(
  root: string,
): Record<string, McpServerConfig> {
  const path = process.env.PARIX_MCP_CONFIG
    ? resolve(process.env.PARIX_MCP_CONFIG)
    : resolve(root, "mcp.servers.json");
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    const servers = parsed?.servers ?? parsed;
    return servers && typeof servers === "object" ? servers : {};
  } catch (err) {
    console.error(
      `[MCP] Failed to parse ${path}: ${err instanceof Error ? err.message : err}`,
    );
    return {};
  }
}

function buildTransport(config: McpServerConfig): Transport {
  if (config.transport === "http") {
    if (!config.url) throw new Error("http MCP server requires a url");
    return new StreamableHTTPClientTransport(new URL(config.url));
  }
  if (config.transport === "stdio") {
    if (!config.command) throw new Error("stdio MCP server requires a command");
    return new StdioClientTransport({
      command: config.command,
      args: config.args ?? [],
      env: { ...(process.env as Record<string, string>), ...(config.env ?? {}) },
    });
  }
  throw new Error(`unsupported MCP transport: ${config.transport}`);
}

function extractText(result: unknown): string {
  const content = (result as { content?: Array<{ type: string; text?: string }> })
    .content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text)
    .join("\n")
    .trim();
}
