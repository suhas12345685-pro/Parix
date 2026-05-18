---
name: parix-hatchery
description: Parix Skill — Hatchery Onboarding
---

# Parix Skill — Hatchery Onboarding

> Use when working on the first-run onboarding wizard or the `npm run hatch` command.

## Running Onboarding

```bash
npm run hatch
```

This runs `python hands/hatchery.py` — a 4-step interactive wizard.

## Onboarding Steps

### Step 1 — Platform Capabilities
Probes and reports:
- OS detection (Windows/macOS/Linux)
- Python version (3.12+ required)
- Node.js version (20+ required)
- Accessibility API availability (pywinauto/pyobjc/pyatspi2)
- Screenshot capability (mss)
- Clipboard access

### Step 2 — Notification Channels
Asks user to configure their preferred notification channel:
- Telegram Bot Token + Chat ID
- Discord webhook URL
- Slack Bot Token + Channel
- Or skip (defaults to desktop notifications)

### Step 3 — LLM Provider Keys
Prompts for API keys:
- Gemini (recommended — free tier available)
- OpenAI, Anthropic, Groq, etc.
- Or use local models (Ollama, LM Studio)

### Step 4 — Save Config
Writes configuration to `.env` file and verifies:
- API keys are valid (quick test call)
- Notification channel is reachable
- All dependencies are installed

## Health Check (Non-Interactive)

```bash
python hands/hatchery.py --check
```

Runs all probes without prompting. Exits 0 if healthy, non-zero if issues found.

## Key File

| File | Purpose |
|------|---------|
| `hands/hatchery.py` | Onboarding wizard + health check |

## Common Issues

- **Unicode errors on Windows**: hatchery.py reconfigures stdout/stderr to UTF-8 before printing status symbols
- **`importlib.util` not imported**: Must use `import importlib.util` (not just `import importlib`)
- **platform.py stdlib shadow**: hatchery.py uses `importlib.util.spec_from_file_location` to import `hands/platform.py` without triggering the stdlib `platform` module shadow
