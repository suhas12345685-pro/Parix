# Tester onboarding — Parix private alpha

Welcome. You're one of the first 5–20 humans to run Parix on hardware Suhas
doesn't own. This page is for you.

## What Parix is, in one paragraph

Parix is a local-first autonomous agent that watches your workstation, picks
up on problems before you notice them, and either fixes them or asks first.
The "watches your workstation" part is the moat: a hybrid OS-accessibility +
vision layer that knows what's on your screen at the API level, not by
guessing from pixels. Everything runs on your machine. We talk to LLM
providers (OpenAI / Anthropic / etc.) over the network for reasoning, but the
agent state, accessibility data, and memory stay local.

## What to expect

- **It will crash.** Probably more than once in the first week. We're at
  v0.1.x. Filing a clean bug report (see below) is the most valuable thing
  you can do.
- **It will be slow on cold starts.** First boot pulls Node deps, builds
  three workspaces, and walks the onboarding wizard. Allow 10–15 minutes on
  a fresh machine.
- **It will ask before doing destructive things** by default. If it doesn't,
  that's a security bug — file it.
- **It will not auto-update.** We poll for new versions and tell you when
  there's one, but you decide when to install. (We'll get to seamless
  updates in Phase 2 of the roadmap; alpha = manual on purpose.)

## Your first hour

1. **Install** following [quickstart.md](quickstart.md). On Windows, run as
   Administrator. On Linux, run on a desktop session, not over SSH (we need
   AT-SPI2 access).
2. **Onboard.** When the Hatchery wizard opens, pick Personal mode, your
   preferred LLM provider, and the channels you actually use. You can change
   any of this later by editing `~/.parix/profile.json`.
3. **Watch it boot.** `parix status` should show three `online` processes.
   Open `http://localhost:3000` for the Aegis dashboard.
4. **Use your computer normally for 30 minutes.** Don't try to "test" Parix.
   The interesting bugs show up in real workflows, not synthetic ones.
5. **Look at the dashboard.** Does it know what app you've been in? Has it
   logged any sensor events? If the activity feed is empty after 30 minutes,
   that's a bug — file it.

## What we want from you

In rough priority order:

1. **Crash reports.** Anything that makes a process die or the UI freeze.
   See [filing-bugs.md](filing-bugs.md) for what to include.
2. **"It did something I didn't expect" reports.** Especially:
   - Took an action when it should have asked.
   - Asked when the action was obviously safe.
   - Made an LLM call when it should have used the rule-based fallback (or
     vice versa).
3. **Honest reactions** to the dashboard and the wake-word voice flow. Is it
   creepy? Useful? Both? Tell us in the alpha chat.
4. **Anything that drained your battery or pegged a CPU core.** Performance
   regressions are easier to fix when caught early.

## What we *don't* want yet

- Feature requests for new skills or new channels. (File them — we read them
  — but Phase 1 is stability.)
- Cosmetic UI feedback. The dashboard will be rebuilt before public beta.
- Comparisons to OpenClaw. We're past the "who copied whom" phase; we'd
  rather hear about *your* workflow.

## How to roll back

If a release breaks something you depended on:

- **Linux/macOS:** `cd ~/.parix && git checkout v0.1.6 && parix stop && parix start`
- **Windows:** Same idea but from `$env:LOCALAPPDATA\Parix`.

If you want to start completely fresh:

- `parix onboarding --reset` clears the profile and reruns the wizard.
- For nuclear reset: `deploy/linux/uninstall.sh` (or the windows/macos
  equivalent), then re-run the one-liner.

## How to reach us

- **GitHub issues:** for anything you're OK posting publicly.
- **Alpha Matrix/Discord:** link in your invitation email. Best for
  "is this me or is this everyone?" questions.
- **Direct to Suhas:** email in your invitation. For security issues only.

## Telemetry — what we collect, what we don't

**Default: off.** No data leaves your machine unless you opt in during
onboarding.

When opted in, Parix sends:

- Crash reports (process name, error class, stack, OS family, Node/Python
  version, Parix version).
- Anonymous startup pings (version, OS family, whether onboarding completed).

We **do not** send:

- Prompts you typed.
- LLM responses.
- Channel messages (Telegram, Discord, etc.).
- Accessibility snapshots.
- Memory DB contents.
- Filenames, paths, or anything from your filesystem.

Full contract: [`docs/privacy.md`](privacy.md). If you spot the agent sending
anything from the "do not" list, that's a security bug — email Suhas
directly.

## Thank you

This is the most valuable phase of the project, and you're doing it
voluntarily. We'll credit you in the v1.0 release notes (or keep you
anonymous if you'd rather).
