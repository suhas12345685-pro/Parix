# Parix

![Coverage](docs/assets/coverage.svg)

Parix is a local-first self-healing AI agent. Atrium is the Node.js brain, Hands is the Python sensor and executor bridge, Aegis is the React dashboard, and Hatchery is the onboarding wizard.

## Quickstart

One-line installers download a small bootstrapper, clone the Parix repo, install all Node and Python packages, build the workspaces, start Hatchery immediately, and bring the agent online after onboarding. Hatchery uses the terminal wizard when it can; if prompts are unavailable, it automatically opens the web onboarding flow in your browser.

Windows PowerShell:

```powershell
powershell -c "irm https://openclaw.ai/install.ps1 | iex"
```

macOS:

```bash
curl -fsSL https://openclaw.ai/install.sh | bash
```

Linux:

```bash
curl -fsSL https://openclaw.ai/install.sh | bash
```

From a repo clone:

```powershell
.\install.ps1
```

After Hatchery finishes, Parix starts Hands, Atrium, and Aegis automatically in the background. Aegis opens at `http://localhost:3000`, or the next free local port if 3000 is busy.

Runtime commands:

```powershell
parix status
parix stop
parix restart
parix start
start parix atrium
```

Inside Aegis chat, you can say `stop parix`, `resume parix`, `start parix atrium`, `status`, or `flush queue`.

Development setup:

```powershell
npm install
python -m pip install -r hands\requirements.txt
python -m pip install -r hands\requirements-dev.txt
npm run onboarding
```

`npm run onboarding` builds all workspaces first, then starts Hatchery. Use `npm run onboarding:web` only when you specifically want to skip the terminal wizard and go straight to the browser flow.

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

Parix v0.2.0-alpha includes a cognitive loop that filters noisy OS events
before they reach the Council, chooses the right thinking strategy,
decomposes work into plan trees, and remembers long-running narratives
across sessions.

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
- `PARIX_WS_HOST`, `PARIX_WS_PORT` - Hands bind host and port. Hands refuses to bind to a non-loopback host unless `PARIX_ALLOW_REMOTE_SYNAPSE=1` is also set.
- `PARIX_SYNAPSE_TOKEN` - Shared secret for the synapse WS handshake. Required when hands binds non-loopback (Docker, k8s). On desktop, hands auto-generates one at `~/.parix/synapse-token`. Both hands and atrium must see the same value.
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
npm run verify:ship
```

`npm run verify:ship` runs the same local push-readiness gate used for the alpha ship check: workspace build, lint, Atrium tests and coverage, Hands tests and compile, skill manifest validation, the e2e pipeline, and the high-severity npm audit.
