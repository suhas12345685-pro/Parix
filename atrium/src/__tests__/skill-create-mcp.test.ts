import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";

import {
  loadSkills,
  matchSkills,
  getRegisteredSkill,
  _resetRegistry,
} from "../intelligence/skill-registry.js";
import { runSkill } from "../intelligence/skill-runner.js";
import { permittedPermissionsForSkill } from "../intelligence/skill-permissions.js";

const SKILLS_ROOT = resolve(__dirname, "../../../skills");
const ID = "task-create-mcp";

let sandbox: string;

beforeAll(() => {
  loadSkills(SKILLS_ROOT);
});

afterAll(() => {
  _resetRegistry();
});

afterEach(() => {
  if (sandbox && existsSync(sandbox)) {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

describe("task-create-mcp", () => {
  it("registers and matches on mcp_scaffold_request", () => {
    expect(getRegisteredSkill(ID)).toBeDefined();
    const matches = matchSkills({
      type: "mcp_scaffold_request",
      data: { name: "notes-search", description: "x" },
      confidence: 0.9,
    });
    expect(matches.some((m) => m.manifest.id === ID)).toBe(true);
  });

  it("scaffolds a complete MCP server project", async () => {
    sandbox = mkdtempSync(join(tmpdir(), "parix-mcp-test-"));
    const reg = getRegisteredSkill(ID);

    const result = await runSkill({
      skillDir: reg!.skillDir,
      manifest: reg!.manifest,
      inputs: {
        name: "notes-search",
        description: "Search the user's local notes",
        outputDir: sandbox,
        tools: [
          {
            name: "search",
            description: "Search notes by keyword",
            inputSchema: {
              type: "object",
              properties: { query: { type: "string" } },
            },
          },
          { name: "list_tags", description: "List all tags" },
        ],
      },
      permittedPermissions: permittedPermissionsForSkill(ID),
    });

    expect(result.success).toBe(true);
    expect(result.output!.path).toContain("notes-search");

    // Every expected file exists.
    const projectDir = join(sandbox, "notes-search");
    expect(existsSync(join(projectDir, "package.json"))).toBe(true);
    expect(existsSync(join(projectDir, "tsconfig.json"))).toBe(true);
    expect(existsSync(join(projectDir, "src", "index.ts"))).toBe(true);
    expect(existsSync(join(projectDir, "README.md"))).toBe(true);
    expect(existsSync(join(projectDir, ".gitignore"))).toBe(true);

    // package.json declares the MCP SDK dep.
    const pkg = JSON.parse(
      readFileSync(join(projectDir, "package.json"), "utf-8"),
    );
    expect(pkg.dependencies).toHaveProperty("@modelcontextprotocol/sdk");
    expect(pkg.type).toBe("module");

    // Server source includes both declared tools and the
    // ListTools / CallTool handlers.
    const srcText = readFileSync(join(projectDir, "src", "index.ts"), "utf-8");
    expect(srcText).toContain('name: "search"');
    expect(srcText).toContain('name: "list_tags"');
    expect(srcText).toContain("ListToolsRequestSchema");
    expect(srcText).toContain("CallToolRequestSchema");
    expect(srcText).toContain("StdioServerTransport");
  });

  it("refuses to overwrite an existing directory", async () => {
    sandbox = mkdtempSync(join(tmpdir(), "parix-mcp-test-"));
    const reg = getRegisteredSkill(ID);

    // First run succeeds.
    const first = await runSkill({
      skillDir: reg!.skillDir,
      manifest: reg!.manifest,
      inputs: {
        name: "collision",
        description: "x",
        outputDir: sandbox,
        tools: [],
      },
    });
    expect(first.success).toBe(true);

    // Second run with the same name should fail cleanly.
    const second = await runSkill({
      skillDir: reg!.skillDir,
      manifest: reg!.manifest,
      inputs: {
        name: "collision",
        description: "x",
        outputDir: sandbox,
        tools: [],
      },
    });
    // The script exits 0 but reports the error in output.
    expect(second.output!.error).toBe("directory_already_exists");
    expect(second.output!.filesCreated).toEqual([]);
  });

  it("slugifies messy names", async () => {
    sandbox = mkdtempSync(join(tmpdir(), "parix-mcp-test-"));
    const reg = getRegisteredSkill(ID);

    const result = await runSkill({
      skillDir: reg!.skillDir,
      manifest: reg!.manifest,
      inputs: {
        name: "My Cool MCP!! Server",
        description: "x",
        outputDir: sandbox,
        tools: [],
      },
    });
    expect(result.success).toBe(true);
    expect(existsSync(join(sandbox, "my-cool-mcp-server"))).toBe(true);
  });
});
