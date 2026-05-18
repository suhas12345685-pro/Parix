---
name: parix-architecture
description: Parix Skill — Architecture Overview
---

# Parix Skill — Architecture Overview

> Use as a starting point to understand Parix's full system architecture before working on any module.

## What Is Parix?

Parix is a polyglot AI agent (Node.js brain + Python body) that monitors a user's OS in the background and **proactively surfaces actionable fixes before being asked**.

## System Components

```
┌─────────────────────────────────────────────────────┐
│                    Parix Stack                       │
│                                                     │
│  ┌──────────┐  WS:8765  ┌──────────┐  WS:8766      │
│  │  Hands   │◄────────►│  Atrium  │──────────►  Aegis UI  │
│  │ (Python) │           │ (Node.js)│           (React:3000) │
│  │          │           │          │                 │
│  │ Sensors  │           │ Council  │  Channels       │
│  │ Executor │           │ LLM      │  (Telegram,     │
│  │ A11y     │           │ Memory   │   Desktop, etc) │
│  └──────────┘           └──────────┘                 │
└─────────────────────────────────────────────────────┘
```

## Module Map

| Layer | Location | Language | Purpose |
|-------|----------|----------|---------|
| **Atrium** | `atrium/` | TypeScript | Brain — Council, LLM, memory, intelligence |
| **Hands** | `hands/` | Python | Body — sensors, executor, accessibility |
| **Aegis** | `aegis/` | React/TSX | Dashboard UI |
| **Hatchery** | `hands/hatchery.py` | Python | Onboarding wizard |
| **Shared** | `shared/` | JSON/SQL | Protocol + schema contracts |
| **Skills** | `skills/` | Markdown | Agent reference docs |
| **Deploy** | `deploy/` | Shell/PS1 | Platform installers |

## Data Flow

```
1. Sensors (Python) detect OS event
2. SENSOR_EVENT sent over Synapse (WS:8765) to Atrium
3. Council transitions: IDLE → OBSERVING → THINKING
4. Constitution checks safety, Governor checks rate limits
5. LLM Router picks best provider, builds action plan
6. Council transitions: THINKING → ACTING
7. TASK_REQUEST sent to Hands for execution
8. Hands executes, returns TASK_RESULT
9. Council logs to audit ledger, notifies user via channel
10. Council returns to IDLE
```

## Key Design Decisions

- **sql.js** (WASM SQLite) instead of better-sqlite3 — avoids native compilation
- **Synapse is WebSocket**, not HTTP — real-time bidirectional
- **Hands is the WS server** (port 8765), Atrium is the client
- **Constitution blocks by default** — destructive commands require explicit user confirmation
- **Multi-model LLM** — auto-detects available API keys, routes by task type
- **PM2** manages all 3 processes via `ecosystem.config.js`

## Related Skills

| Skill | File |
|-------|------|
| Platform detection | `skills/os-detect.md` |
| Windows specifics | `skills/os-windows.md` |
| macOS specifics | `skills/os-macos.md` |
| Linux specifics | `skills/os-linux.md` |
| Docker specifics | `skills/os-docker.md` |
| Synapse bridge | `skills/parix-synapse.md` |
| Sensors | `skills/parix-sensors.md` |
| Intelligence | `skills/parix-intelligence.md` |
| LLM router | `skills/parix-llm.md` |
| Channels | `skills/parix-channels.md` |
| Memory & storage | `skills/parix-memory.md` |
| Aegis dashboard | `skills/parix-aegis.md` |
| Hatchery onboarding | `skills/parix-hatchery.md` |
| Accessibility | `skills/parix-accessibility.md` |
| Installation | `skills/parix-install.md` |
| Operations | `skills/parix-operations.md` |
| Safety rules | `skills/parix-safety.md` |
| Troubleshooting | `skills/parix-troubleshooting.md` |
