# Parix

![Coverage](docs/assets/coverage.svg)

Parix is a local-first self-healing AI agent. Atrium is the Node.js brain, Hands is the Python sensor and executor bridge, Aegis is the React dashboard, and Hatchery is the onboarding wizard.

## Quickstart

```powershell
npm install
python -m pip install -r hands\requirements.txt
npm run build:all
npm run onboarding -- --web
```

Development run:

```powershell
python -m hands.main
npm run dev --workspace=atrium
cd aegis
npx vite dev --host 127.0.0.1
```

Production-style Docker run:

```powershell
docker compose up --build
```

Aegis opens at `http://localhost:3000`, Atrium health is at `http://localhost:8766/healthz`, and Hands listens on `ws://localhost:8765`.

## Architecture

```text
User
  |
  v
Hatchery onboarding --> profile.json + secrets + starter skills
  |
  v
Aegis dashboard --ws://8766--> Atrium brain --ws://8765--> Hands executor/sensors
                                  |
                                  v
                           SQLite/sql.js memory
```

Main packages:

- `atrium/` - TypeScript brain, Aegis relay, Synapse client, scheduler, LLM adapters, channels, memory.
- `hands/` - Python WebSocket server, OS sensors, CLI executor, screenshots, accessibility and voice hooks.
- `aegis/` - Vite React dashboard for chat, health, cron jobs, skills, settings, and diagnostics.
- `hatchery/` - CLI and web onboarding wizard.
- `shared/` - protocol ports, message contract, profile schema, and SQLite DDL.

## Cognition

Parix v0.1.3-alpha adds a cognitive loop that filters noisy OS events before
they reach the Council, chooses the right thinking strategy, decomposes work
into plan trees, and remembers long-running narratives across sessions.

```text
event -> attention -> working memory -> desire -> hypotheses
      -> metacognition -> planner -> horizon -> simulate
      -> execute -> learn
```

The key modules are `atrium/src/cognition/attention.ts`,
`atrium/src/cognition/metacognition.ts`, `atrium/src/cognition/planner/`,
and `atrium/src/cognition/horizon.ts`. See
[docs/cognition.md](docs/cognition.md) for thresholds and tuning, and
[docs/architecture.md](docs/architecture.md) for the layer map.

## Environment

Copy `.env.example` to `.env` and fill only what you use.

Common variables:

- `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `XAI_API_KEY`, `PERPLEXITY_API_KEY`, `MISTRAL_API_KEY`, `DEEPSEEK_API_KEY` - cloud LLM providers.
- `OLLAMA_BASE_URL`, `LMSTUDIO_BASE_URL` - local model endpoints.
- `HANDS_WS_URL` - Atrium to Hands URL, defaults to `ws://localhost:8765`.
- `PARIX_WS_HOST`, `PARIX_WS_PORT` - Hands bind host and port.
- `PARIX_HOME` - profile and auth storage root.
- `PARIX_DB_PATH` - memory database path for container or deployment overrides.
- Channel secrets such as Telegram, Slack, Discord, Teams, and webhook URLs are documented in `.env.example`.

## Channels

Channel adapters live in `atrium/src/channels/adapters/`. To add one:

1. Follow the existing adapter shape and keep external API calls isolated in that file.
2. Add any runtime config keys to `.env.example`.
3. Register the adapter through the channel registry if it should appear in Aegis or Hatchery.
4. Add a focused unit test or a mockable transport path for the send operation.

## Skills

Skills live in `.agents/skills/<skill-id>/` and must include `SKILL.md`. Hatchery can create the first starter skill during web onboarding, and Aegis can create additional skills from the Skills page.

Recommended structure:

```text
.agents/skills/my-skill/
  SKILL.md
  scripts/
  references/
  templates/
```

## Verification

```powershell
npm run build:all
npm run test --workspace=atrium
npm run test:coverage
npm run coverage:badge
python -m pytest hands/tests
npx tsx scripts/test-e2e.ts
```
