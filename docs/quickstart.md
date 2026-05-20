# Quickstart

Get Parix running on a clean machine in under 10 minutes.

## What you need

- Windows 10/11, macOS 12+, or Linux (Ubuntu 22.04+ / Fedora 38+ tested)
- Node.js 20+ ([nodejs.org](https://nodejs.org), LTS installer)
- Python 3.12+ ([python.org](https://www.python.org/downloads/) — on Windows
  check "Add Python to PATH")
- Git
- An API key for one of the supported providers (OpenAI, Anthropic, Gemini,
  Groq, Ollama for local, etc.) — or skip and configure later.

## Install

### Windows (run in an **Administrator** PowerShell)

```powershell
irm https://install.parix.ai/win.ps1 | iex
```

Or, from a clone of the repo:

```powershell
.\install.ps1
```

### macOS / Linux

```bash
curl -fsSL https://install.parix.ai/install.sh | bash
```

Or, from a clone:

```bash
./install.sh
```

The installer:

1. Checks Node, Python, git, and platform-specific accessibility deps.
2. Copies Parix into `%LOCALAPPDATA%\Parix` (Windows) or `~/.parix` (mac/Linux).
3. Builds Atrium, Hatchery, and Aegis.
4. Registers an auto-start hook (Task Scheduler on Windows, `systemd --user`
   on Linux; macOS auto-start is not yet wired — see ROADMAP.md Phase 0).
5. Drops you into the Hatchery onboarding wizard.

## First run

The Hatchery wizard asks for:

- **Mode** — Personal or Enterprise.
- **LLM provider** — pick one; you can change it later in `~/.parix/profile.json`.
- **API key** — or `Skip` to use a local provider (Ollama, LM Studio).
- **Wake word** — defaults to `aegis`; use this to talk to Parix in the UI.
- **Channels** — Aegis is always on; Telegram, Discord, etc. are optional.

Saves to `~/.parix/profile.json` and `~/.parix/.env`. Then auto-starts the
three runtime processes via PM2.

## Verify it works

```bash
parix status
```

You should see:

```
parix-hands   online
parix-atrium  online
parix-aegis   online
```

Open `http://localhost:3000` in your browser to reach the Aegis UI.

## If something goes wrong

Run the dep check:

```bash
parix onboarding --check
```

It prints every missing dep with an actionable fix command. See
[troubleshooting.md](troubleshooting.md) for common issues.

## Next

- [filing-bugs.md](filing-bugs.md) — how to report what went wrong.
- [tester-onboarding.md](tester-onboarding.md) — if you're one of the alpha
  testers, read this too.
- [boot-order.md](boot-order.md) — what each of the three processes does and
  in what order they start.
