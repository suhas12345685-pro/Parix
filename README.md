# Parix

![Coverage](docs/assets/coverage.svg)

**A proactive desktop agent that reads your UI before it reaches for pixels.**

Parix watches your computer with accessibility APIs first, falls back to
vision OCR through your chosen LLM provider when structured UI data is not
enough, and routes approved actions through a local Node/Python runtime. It is
early alpha software, but the v0.2 surface is real: Windows is verified,
macOS and Linux accessibility backends are code-complete pending real-hardware
verification.

## What Makes It Different

- **Accessibility-first sensing.** Windows uses UIAutomation via
  `uiautomation`/pywinauto. macOS uses the AX API through pyobjc. Linux uses
  AT-SPI2. Vision is a fallback, not the default way Parix sees.
- **Hybrid vision only when needed.** v0.2 routes screenshot OCR through the
  Atrium LLM router, using the multimodal provider you onboarded
  (Anthropic, OpenAI, or OpenRouter today). Tesseract remains the local
  fallback.
- **Local-first by default.** The runtime, memory database, logs, skill
  registry, and Aegis dashboard run on your machine. Parix-operated telemetry
  is opt-in and off by default.
- **Visible operation.** Aegis shows the Council state, event stream, cognition
  state, focused accessibility element, skills, channels, cron jobs, settings,
  and audit trail in real time.
- **Small, inspectable runtime.** Atrium is the TypeScript brain. Hands is the
  Python OS sensor/executor. The bridge protocol and SQLite schema live in
  `shared/`.

## See It In 30 Seconds

There are no committed product screenshots yet. For v0.2, the screenshots to
capture from a live run are:

- **Aegis Chat:** send a message directly to Atrium.
- **Aegis Overview:** Council state, Hands connectivity, queue depth, recent
  events, cognition, active plan, and narratives.
- **Accessibility Focus:** focused app, focused element role/name/state,
  backend used (`uiautomation`, `axapi`, `atspi`, `vision`, or `fused`), and
  confidence.
- **Audit/Settings:** pause/resume controls, recent audit entries, and runtime
  diagnostics.

## Quick Start

Verified path for v0.2: Windows. Node.js 20.10+ and Python 3 are required.

```powershell
git clone https://github.com/suhas12345685-pro/Parix.git
cd Parix
npm install
python -m pip install -r hands\requirements.txt
npm run build:all
npm run onboarding:web
```

Complete onboarding in the browser, choose an LLM provider or local model
endpoint, then open Aegis at `http://localhost:3000`. The Chat page should
respond to a message once the provider is configured.

Useful local checks:

```powershell
npm run test --workspace=atrium
python -m pytest hands/tests
npm run test:e2e
```

## Architecture

Parix is split into four workspaces plus shared contracts. Hatchery creates
the local profile, Aegis displays live state, Atrium reasons and persists
memory, and Hands watches or acts on the OS through a typed WebSocket bridge.

```text
User
  |
  v
Hatchery onboarding
  |
  v
Aegis dashboard <-- ws://localhost:8766 --> Atrium brain
                                                |
                                                v
                                      SQLite/sql.js memory
                                                |
                                                v
Hands executor/sensors <-- ws://localhost:8765 --+
```

Read the longer map in [docs/architecture.md](docs/architecture.md).

## Privacy And Security

Parix's default install runs on your machine. The only default network calls
are to the LLM provider you choose during onboarding and an optional anonymous
update check. Telemetry is off in every fresh profile; if enabled, the profile
schema requires an explicit consent timestamp.

Parix never sends prompts, LLM responses, channel messages, file contents,
screen contents, OCR results, names, identifiers, or API keys to a
Parix-operated server. Vision OCR screenshots go to your chosen LLM provider
only when that fallback is engaged.

v0.2 has a published pre-launch audit in
[docs/security-audit-v0.2.md](docs/security-audit-v0.2.md). The self-approval
bypass is fixed. The current skill surface is first-party and local; broader
third-party skill permission UX remains v1.0 work. Synapse binds to localhost
by default, with remote/auth hardening tracked before public v1.0.

The privacy contract is [docs/privacy.md](docs/privacy.md). If code disagrees
with that document, the code is wrong.

## Platform Status

| Platform | Accessibility backend | v0.2 status |
|---|---|---|
| Windows | UIAutomation / pywinauto | Production path, verified |
| macOS | AX API / pyobjc | Code-complete, awaiting real-Mac verification |
| Linux | AT-SPI2 / D-Bus | Code-complete, awaiting real-Linux verification |
| Any | Vision OCR + Tesseract fallback | Routed through the user's configured provider |

Setup and verification notes are in
[docs/accessibility-plan.md](docs/accessibility-plan.md).

## Channels And Skills

Channels live under `atrium/src/channels/`. Aegis is always available for local
visibility. External adapters such as Telegram, Slack, Discord, Teams, Matrix,
Signal, WhatsApp, LINE, Feishu, Mattermost, Nextcloud, IRC, Nostr, Twitch,
Zalo, WeChat, QQ, and WebChat are operator-configured through env/profile
settings.

Skills live in `.agents/skills/<skill-id>/` and include a `SKILL.md` file,
with optional `scripts/`, `references/`, and `templates/` folders. The v0.2
skill registry is intended for local/first-party skills, not an open
marketplace.

<details>
<summary>Common configuration variables</summary>

Copy `.env.example` to `.env` and fill only what you use.

- LLM providers: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`,
  `GROQ_API_KEY`, `XAI_API_KEY`, `PERPLEXITY_API_KEY`, `MISTRAL_API_KEY`,
  `KIMI_API_KEY`, `OPENROUTER_API_KEY`, `BYTEZ_API_KEY`, `DEEPSEEK_API_KEY`.
- Local models: `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `LMSTUDIO_BASE_URL`,
  `LMSTUDIO_API_KEY`, `LMSTUDIO_MODEL`.
- Runtime: `PARIX_HOME`, `NODE_ENV`, `HANDS_WS_URL`, `PARIX_WS_HOST`,
  `PARIX_WS_PORT`, `PARIX_DB_PATH`.
- Accessibility: `PARIX_A11Y_DISABLED`, `PARIX_A11Y_INTERVAL_S`,
  `PARIX_A11Y_MODE`.
- Channels: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `PARIX_WEBHOOK_URL`,
  plus the service-specific keys listed in `.env.example`.

</details>

## Where To Go Next

- [docs/](docs/) for architecture, cognition, privacy, accessibility, and
  operator notes.
- [SHIP-PLAN.md](SHIP-PLAN.md) for the current v0.2/v1.0 status, deferred
  tracks, and human verification blockers.
- [.github/RELEASE-v0.2.0-alpha.md](.github/RELEASE-v0.2.0-alpha.md) for the
  v0.2 release notes draft.
- [CHANGELOG.md](CHANGELOG.md) for dated shipped changes.
