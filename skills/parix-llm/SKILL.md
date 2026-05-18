---
name: parix-llm
description: Parix Skill — LLM Router & Adapters
---

# Parix Skill — LLM Router & Adapters

> Use when adding LLM providers, modifying routing logic, or debugging LLM calls.

## Architecture

```
Council (THINKING state)
  └── LLM Router (router.ts)
        ├── Registry (registry.ts) — task-type → provider mapping
        ├── Fallback Chain — if primary fails, try next provider
        └── Adapters (adapters/) — 11 provider implementations
```

## LLMAdapter Interface (`types.ts`)

Every adapter must implement:

```typescript
interface LLMAdapter {
  name: string;
  available(): Promise<boolean>;
  chat(messages: ChatMessage[], options?: LLMOptions): Promise<LLMResponse>;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LLMResponse {
  content: string;
  usage?: { prompt_tokens: number; completion_tokens: number };
  model?: string;
}
```

## Provider Adapters

| Adapter | File | SDK/Method | API Key Env Var |
|---------|------|------------|-----------------|
| Gemini | `gemini.ts` | `@google/generative-ai` | `GEMINI_API_KEY` |
| OpenAI | `openai.ts` | `openai` SDK | `OPENAI_API_KEY` |
| Claude | `claude.ts` | `@anthropic-ai/sdk` | `ANTHROPIC_API_KEY` |
| Groq | `groq.ts` | `groq-sdk` | `GROQ_API_KEY` |
| Grok | `grok.ts` | fetch → `api.x.ai` | `GROK_API_KEY` |
| Mistral | `mistral.ts` | `@mistralai/mistralai` | `MISTRAL_API_KEY` |
| Perplexity | `perplexity.ts` | fetch → `api.perplexity.ai` | `PERPLEXITY_API_KEY` |
| DeepSeek | `deepseek.ts` | OpenAI-compatible fetch | `DEEPSEEK_API_KEY` |
| Ollama | `ollama.ts` | fetch → `localhost:11434` | None (local) |
| LM Studio | `lmstudio.ts` | fetch → `localhost:1234` | None (local) |
| Mock | `mock.ts` | Hardcoded responses | None |

## Task-Type Routing (`registry.ts`)

Maps task types to preferred provider chains:

```
planning    → [gemini, claude, openai, groq]
coding      → [claude, openai, deepseek, gemini]
summarize   → [groq, gemini, openai, claude]
search      → [perplexity, gemini, openai]
default     → [gemini, openai, claude, groq]
```

## Fallback Logic

1. Try primary provider for task type
2. If fails (API error, timeout, rate limit), try next in chain
3. If all cloud providers fail, try local (Ollama → LM Studio)
4. If all fail, return `null` — Council falls back to rule-based planning

## Auto-Detection at Boot

`atrium/src/index.ts` scans environment variables at startup:

```typescript
if (process.env.GEMINI_API_KEY)    router.register('gemini', new GeminiAdapter());
if (process.env.ANTHROPIC_API_KEY) router.register('claude', new ClaudeAdapter());
// ... etc
```

## Adding a New Provider

1. Create `atrium/src/llm/adapters/myprovider.ts`
2. Implement `LLMAdapter` interface
3. Add env var detection in `atrium/src/index.ts`
4. Add to routing chains in `registry.ts`
5. Add test in `atrium/src/llm/__tests__/`

## Governor Integration

Every LLM call passes through the Governor (`governor.ts`) which:
- Checks daily token budget before calling
- Records `prompt_tokens + completion_tokens` after each call
- Blocks calls if budget exceeded (notifies user)

## Testing

```bash
# Router + fallback tests
npx vitest run atrium/src/llm/__tests__/router.test.ts

# Individual adapter tests (requires API keys)
GEMINI_API_KEY=xxx npx vitest run atrium/src/llm/__tests__/gemini.test.ts
```
