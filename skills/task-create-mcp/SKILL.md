---
name: task-create-mcp
description: Scaffold a Model Context Protocol (MCP) server from a name, description, and tool list. Produces a self-contained Node.js project ready to install and run.
---

# Create MCP

> Use when the user (or the council) wants Parix to bring up a new
> MCP server — to expose custom tools to Claude, Aegis, or any other
> MCP client. The skill writes a complete, self-contained Node
> project; the user fills in the actual tool implementations after.

## What gets scaffolded

```
<outputDir>/<name>/
├── package.json          # @modelcontextprotocol/sdk + zod + typescript
├── tsconfig.json
├── src/
│   └── index.ts          # MCP server with the requested tools wired
├── README.md             # how to install, run, and register with a client
└── .gitignore
```

Each tool the caller declares becomes:
- A registered tool on the MCP server (using
  `Server.setRequestHandler(CallToolRequestSchema, ...)` pattern)
- A placeholder handler that returns a `not_implemented` text block —
  the user replaces the body with real logic

The transport defaults to **stdio** (the most common for desktop MCP
clients like Claude Desktop). If `transport: "http"` is passed, an
HTTP/SSE entry is written instead.

## What the skill does NOT do

- It does **not** install dependencies (no `npm install` call). The
  user runs that — the skill output's `runCommand` field has the
  exact command to run.
- It does **not** register the new MCP with any client. The
  `nextSteps[]` output walks the user through doing that for Claude
  Desktop / Claude Code / etc.
- It does **not** invent the tool logic. The placeholder handlers
  are clearly marked `TODO` and return a not-implemented block.

## Why this is a real skill rather than docs

The MCP scaffolding boilerplate is mechanical and error-prone if you
write it by hand (correct schemas, the dance between
`ListToolsRequestSchema` and `CallToolRequestSchema`, the JSON
serialization of tool outputs). Encoding it once in a skill means
every future MCP Parix or its user wants to create starts from a
working baseline.

## Composition with the autonomous loop

The autonomous creative agent loop (PR #2) can call this skill as
the **first step** of a multi-step plan like "build me a custom MCP
that searches my notes." Step 1: `task-create-mcp` to scaffold.
Step 2: agent edits `src/index.ts` to fill in the handler bodies.
Step 3: user runs `runCommand` and registers with their client. The
output's `nextSteps[]` is what the agent reads to decide step 2's
edits.

## Permissions

- `filesystem:read` — to detect the project root and check for
  conflicts.
- `filesystem:write` — to create the scaffolded files.

No network, no process execution. The user does `npm install`
themselves so the skill never spends network bandwidth without
explicit user action.
