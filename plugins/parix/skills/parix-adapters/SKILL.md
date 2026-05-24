---
name: parix-adapters
description: Add or modify Parix adapters for LLM providers, notification channels, storage providers, and router fallback chains. Use when editing `atrium/src/llm/*`, `atrium/src/channels/*`, provider registries, env-key handling, or adapter tests.
---

# Parix Adapters

## Workflow

1. Read the existing `types.ts`, `router.ts`, and nearest adapter before editing.
2. Implement the interface exactly: LLM adapters expose `complete(request)`, channel adapters expose `send(payload)`.
3. Prefer OpenAI-compatible REST adapters where the provider supports `/chat/completions`.
4. Keep adapters disabled when credentials are absent, except local providers such as Ollama.
5. Make routers deterministic and test fallback order.
6. Run `npm run build --workspace=atrium` and `npm run test --workspace=atrium`.

## Current LLM Roster

Provider ids are pinned in `atrium/src/llm/registry.ts`:

`chatgpt`, `anthropic`, `google`, `grok`, `openrouter`, `groq`, `kimi`, `ollama`.

Use `chatgpt` as the routed OpenAI provider id. Keep `OpenAIAdapter` as reusable plumbing only.

## Channel Tiers

- Tier A: rich action channels such as Telegram, then desktop/webhook fallback.
- Tier B: keyword or webhook style replies.
- Tier C: consumer/passive notification channels.

Do not let one failing channel prevent fallback to the next enabled channel.
