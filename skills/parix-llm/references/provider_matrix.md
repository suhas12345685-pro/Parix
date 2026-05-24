# LLM Provider Matrix

## Cloud Providers

| Adapter    | File            | SDK / Method              | Env Var              |
|------------|-----------------|---------------------------|----------------------|
| Gemini     | `gemini.ts`     | `@google/generative-ai`   | `GEMINI_API_KEY`     |
| OpenAI     | `openai.ts`     | `openai` SDK              | `OPENAI_API_KEY`     |
| Claude     | `claude.ts`     | `@anthropic-ai/sdk`       | `ANTHROPIC_API_KEY`  |
| Groq       | `groq.ts`       | `groq-sdk`                | `GROQ_API_KEY`       |
| Grok       | `grok.ts`       | fetch -> `api.x.ai`       | `GROK_API_KEY`       |
| Mistral    | `mistral.ts`    | `@mistralai/mistralai`    | `MISTRAL_API_KEY`    |
| Kimi       | `kimi.ts`       | OpenAI-compatible fetch   | `KIMI_API_KEY`       |
| OpenRouter | `openrouter.ts` | OpenAI-compatible fetch   | `OPENROUTER_API_KEY` |

## Local Providers

| Adapter    | File            | Endpoint              | API Key |
|------------|-----------------|-----------------------|---------|
| Ollama     | `ollama.ts`     | `localhost:11434`     | None    |
| LM Studio  | `lmstudio.ts`  | `localhost:1234`      | None    |
| Mock       | `mock.ts`       | Hardcoded             | None    |

## Task-Type Routing

| Task Type  | Provider Chain (priority order)         |
|------------|-----------------------------------------|
| planning   | gemini, claude, openai, groq            |
| coding     | claude, openai, kimi, groq              |
| summarize  | groq, gemini, openai, claude            |
| search     | openai, openrouter                      |
| default    | gemini, openai, claude, groq            |

## Fallback Order

1. Primary provider for task type
2. Next in chain
3. Local (Ollama -> LM Studio)
4. `null` -> Council falls back to rule-based planning

## Adding a New Provider

1. Create `atrium/src/llm/adapters/<name>.ts`
2. Implement `LLMAdapter` interface
3. Add env var detection in `atrium/src/index.ts`
4. Add to routing chains in `registry.ts`
5. Add test in `atrium/src/llm/__tests__/`
