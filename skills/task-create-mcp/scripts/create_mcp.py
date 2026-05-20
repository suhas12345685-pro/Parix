#!/usr/bin/env python3
"""Scaffold a Model Context Protocol (MCP) server.

Reads JSON from stdin:
    {"name": "notes-search",
     "description": "Search the user's local notes",
     "tools": [{"name": "search", "description": "Search notes", "inputSchema": {...}}],
     "outputDir": "./mcps",
     "transport": "stdio"}

Writes the scaffold and emits a JSON summary on stdout.
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path


def slug(name: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9-]+", "-", (name or "").strip().lower())
    s = re.sub(r"-+", "-", s).strip("-")
    return s or "mcp-server"


def sanitize_tool_name(name: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9_]+", "_", (name or "").strip())
    return s or "unnamed_tool"


def package_json(name: str) -> str:
    return json.dumps(
        {
            "name": name,
            "version": "0.1.0",
            "type": "module",
            "private": True,
            "description": f"MCP server: {name}",
            "scripts": {
                "build": "tsc",
                "start": "node dist/index.js",
                "dev": "tsx watch src/index.ts",
            },
            "dependencies": {
                "@modelcontextprotocol/sdk": "^1.0.0",
                "zod": "^3.23.0",
            },
            "devDependencies": {
                "@types/node": "^20.0.0",
                "tsx": "^4.7.0",
                "typescript": "^5.3.3",
            },
        },
        indent=2,
    )


def tsconfig_json() -> str:
    return json.dumps(
        {
            "compilerOptions": {
                "target": "ES2022",
                "module": "ESNext",
                "moduleResolution": "bundler",
                "outDir": "./dist",
                "rootDir": "./src",
                "strict": True,
                "esModuleInterop": True,
                "skipLibCheck": True,
                "declaration": False,
                "resolveJsonModule": True,
            },
            "include": ["src/**/*.ts"],
            "exclude": ["node_modules", "dist"],
        },
        indent=2,
    )


def gitignore_file() -> str:
    return "node_modules/\ndist/\n*.log\n.env\n.env.local\n"


def stdio_server_ts(name: str, description: str, tools: list[dict]) -> str:
    tool_defs = []
    tool_handlers = []
    for t in tools:
        tool_name = sanitize_tool_name(str(t.get("name", "")))
        tool_desc = str(t.get("description", "")).replace("\n", " ")
        input_schema = t.get("inputSchema") or {
            "type": "object",
            "properties": {},
        }
        tool_defs.append(
            "    {\n"
            f"      name: {json.dumps(tool_name)},\n"
            f"      description: {json.dumps(tool_desc)},\n"
            f"      inputSchema: {json.dumps(input_schema)},\n"
            "    }"
        )
        tool_handlers.append(
            f"    case {json.dumps(tool_name)}:\n"
            "      return {\n"
            "        content: [\n"
            "          {\n"
            "            type: \"text\",\n"
            f"            text: \"TODO: implement {tool_name}. args=\" + JSON.stringify(args),\n"
            "          },\n"
            "        ],\n"
            "      };"
        )

    tools_block = ",\n".join(tool_defs) if tool_defs else ""
    handlers_block = "\n".join(tool_handlers)

    return (
        "#!/usr/bin/env node\n"
        "/**\n"
        f" * {name} — {description}\n"
        " *\n"
        " * MCP server scaffolded by task-create-mcp. Tool handlers are\n"
        " * placeholders — replace each `TODO` block with real logic.\n"
        " */\n\n"
        "import { Server } from \"@modelcontextprotocol/sdk/server/index.js\";\n"
        "import { StdioServerTransport } from \"@modelcontextprotocol/sdk/server/stdio.js\";\n"
        "import {\n"
        "  CallToolRequestSchema,\n"
        "  ListToolsRequestSchema,\n"
        "} from \"@modelcontextprotocol/sdk/types.js\";\n\n"
        "const TOOLS = [\n"
        f"{tools_block}\n"
        "];\n\n"
        "const server = new Server(\n"
        "  {\n"
        f"    name: {json.dumps(name)},\n"
        "    version: \"0.1.0\",\n"
        "  },\n"
        "  {\n"
        "    capabilities: { tools: {} },\n"
        "  },\n"
        ");\n\n"
        "server.setRequestHandler(ListToolsRequestSchema, async () => ({\n"
        "  tools: TOOLS,\n"
        "}));\n\n"
        "server.setRequestHandler(CallToolRequestSchema, async (request) => {\n"
        "  const { name, arguments: args } = request.params;\n"
        "  switch (name) {\n"
        f"{handlers_block}\n"
        "    default:\n"
        "      return {\n"
        "        content: [{ type: \"text\", text: `Unknown tool: ${name}` }],\n"
        "        isError: true,\n"
        "      };\n"
        "  }\n"
        "});\n\n"
        "const transport = new StdioServerTransport();\n"
        "await server.connect(transport);\n"
        "console.error(\"MCP server " + name + " listening on stdio\");\n"
    )


def readme_md(name: str, description: str, tools: list[dict], transport: str) -> str:
    tool_list = (
        "\n".join(
            f"- `{sanitize_tool_name(str(t.get('name', '')))}` — {t.get('description', '')}"
            for t in tools
        )
        or "_(no tools declared yet)_"
    )
    return (
        f"# {name}\n\n"
        f"{description}\n\n"
        "Scaffolded by Parix `task-create-mcp`. Tool handlers are\n"
        "placeholders — open `src/index.ts` and replace each `TODO` block.\n\n"
        "## Install + run\n\n"
        "```\n"
        "npm install\n"
        "npm run build\n"
        "npm start\n"
        "```\n\n"
        "For iteration:\n\n"
        "```\n"
        "npm run dev\n"
        "```\n\n"
        "## Register with a client\n\n"
        "### Claude Desktop\n\n"
        "Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\\Claude\\claude_desktop_config.json` (Windows):\n\n"
        "```json\n"
        "{\n"
        "  \"mcpServers\": {\n"
        f"    \"{name}\": {{\n"
        "      \"command\": \"node\",\n"
        f"      \"args\": [\"{{absolute path}}/dist/index.js\"]\n"
        "    }\n"
        "  }\n"
        "}\n"
        "```\n\n"
        "### Claude Code\n\n"
        "```\n"
        f"claude mcp add {name} -- node {{absolute path}}/dist/index.js\n"
        "```\n\n"
        "## Tools\n\n"
        f"{tool_list}\n\n"
        f"## Transport\n\n`{transport}` — the standard for desktop MCP clients.\n"
    )


def main() -> int:
    raw = sys.stdin.read().strip()
    try:
        inputs = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        inputs = {}

    if not isinstance(inputs, dict):
        inputs = {}

    name = slug(str(inputs.get("name", "")))
    description = str(inputs.get("description", "")).strip() or f"MCP server: {name}"
    tools_raw = inputs.get("tools") if isinstance(inputs.get("tools"), list) else []
    tools = [t for t in tools_raw if isinstance(t, dict)]
    transport = str(inputs.get("transport", "stdio")).strip().lower()
    if transport not in ("stdio", "http"):
        transport = "stdio"

    output_dir = str(inputs.get("outputDir", "")).strip() or "./mcps"
    try:
        base = Path(output_dir).expanduser().resolve()
        base.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        print(
            json.dumps(
                {
                    "path": "",
                    "entry": "",
                    "filesCreated": [],
                    "runCommand": "",
                    "nextSteps": [],
                    "error": f"could not create outputDir: {e}",
                }
            )
        )
        return 1

    project_dir = base / name
    if project_dir.exists():
        print(
            json.dumps(
                {
                    "path": str(project_dir),
                    "entry": "",
                    "filesCreated": [],
                    "runCommand": "",
                    "nextSteps": [],
                    "error": "directory_already_exists",
                }
            )
        )
        return 1

    src_dir = project_dir / "src"
    src_dir.mkdir(parents=True)

    written: list[str] = []

    def write(rel: str, contents: str) -> None:
        p = project_dir / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(contents, encoding="utf-8")
        written.append(str(p.relative_to(base.parent if base.parent.exists() else base)))

    write("package.json", package_json(name) + "\n")
    write("tsconfig.json", tsconfig_json() + "\n")
    write(".gitignore", gitignore_file())
    write("src/index.ts", stdio_server_ts(name, description, tools))
    write("README.md", readme_md(name, description, tools, transport))

    abs_entry = str((project_dir / "src" / "index.ts").resolve())
    run_cmd = f"cd {project_dir} && npm install && npm run build && npm start"
    next_steps = [
        f"Replace the TODO placeholders in {project_dir / 'src' / 'index.ts'} with real tool implementations.",
        "Run `npm install` in the new directory.",
        "Register the server with your MCP client (Claude Desktop config or `claude mcp add`).",
    ]

    print(
        json.dumps(
            {
                "path": str(project_dir),
                "entry": abs_entry,
                "filesCreated": written,
                "runCommand": run_cmd,
                "nextSteps": next_steps,
            }
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
