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
powershell -c "irm https://openclaw.ai/install.ps1 | iex"
```

Or, from a clone of the repo:

```powershell
.\install.ps1
```

### macOS

```bash
curl -fsSL https://openclaw.ai/install.sh | bash
```

### Linux

```bash
curl -fsSL https://openclaw.ai/install.sh | bash
```

Or, from a clone:

```bash
./install.sh
```

The installer downloads a bootstrapper that clones the Parix repo, then:

1. Checks Node, Python, git, and platform-specific accessibility deps.
2. Copies Parix into `%LOCALAPPDATA%\Parix` (Windows) or `~/.parix` (mac/Linux).
3. Installs or reuses Node.js and Python packages.
4. Builds Atrium, Hatchery, and Aegis.
5. Registers an auto-start hook (Task Scheduler on Windows, `systemd --user`
   on Linux, launchd on macOS).
6. Starts Hatchery onboarding immediately, using terminal prompts when available or the web flow when they are not.
7. Starts Hands, Atrium, and Aegis as soon as you finish onboarding.

## First run

Hatchery onboarding asks for:

- **Mode** — Personal or Enterprise.
- **LLM provider** — pick one; you can change it later in `~/.parix/profile.json`.
- **API key** — or `Skip` to use a local provider (Ollama, LM Studio).
- **Wake word** — defaults to `aegis`; use this to talk to Parix in the UI.
- **Channels** — Aegis is always on; Telegram, Discord, etc. are optional.

Saves to `~/.parix/profile.json`, `~/.parix/.env`, and the agent workspace
files (`SOUL.md`, `IDENTITY.md`, `USER.md`, memory, tools, and checklists).
Then it auto-starts the three runtime processes through Hatchery.

From a repo clone, the equivalent development entrypoint is:

```bash
npm install
python -m pip install -r hands/requirements.txt
npm run onboarding
```

That script builds all workspaces before launching Hatchery, so a fresh clone does not need a separate build command before onboarding.

The runtime stays in the background. On Windows it uses hidden process launch
flags and prefers `pythonw.exe` for Hands so a `py.exe` console window should
not appear.

## Verify it works

```bash
parix status
```

You should see:

```
[hatchery] hands: running
[hatchery] atrium: running
[hatchery] aegis: running
```

Open `http://localhost:3000` in your browser to reach the Aegis UI. If 3000 is
already busy, Hatchery chooses the next free local port and opens that instead.

Useful commands:

```bash
parix stop
parix restart
parix start
parix start atrium
```

In Aegis chat, say `stop parix` to pause autonomous actions, `start parix
atrium` to resume, or `status` for a quick health readout.

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
