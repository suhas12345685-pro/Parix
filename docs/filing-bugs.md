# Filing bugs

Parix is in private alpha. Reports from testers are the only feedback loop we
have right now — make them count.

## Where to file

- **GitHub Issues** (preferred): https://github.com/suhas12345685-pro/Parix/issues
- **Private alpha Matrix/Discord:** invite link is in your tester onboarding
  email. Best for quick "is anyone else seeing this?" questions.
- **Direct to Suhas:** only for security issues you don't want public — email
  in your onboarding email.

## What to include

A good bug report has five things. Skip any of them and we'll come back and
ask.

### 1. Symptom in one sentence

> "Aegis UI loads but stays on the 'Connecting to Atrium…' spinner forever."

Not: "Parix is broken."

### 2. What you were doing

Step-by-step, from a known-good state. If you don't remember, "I just opened
it after a reboot" is fine — just say so.

### 3. Versions

```bash
parix onboarding --check
```

Paste the **whole** output. It already includes OS, arch, Node version,
Python version, distro, and capability check results.

If `parix` isn't on your PATH yet, run from the install dir:

- Linux/macOS: `~/.parix/bin/parix onboarding --check`
- Windows: `& "$env:LOCALAPPDATA\Parix\bin\parix.ps1" onboarding --check`

### 4. Logs

The last 200 lines of each runtime log:

```bash
# Linux/macOS
tail -n 200 ~/.parix/logs/parix-hands-error.log
tail -n 200 ~/.parix/logs/parix-atrium-error.log
tail -n 200 ~/.parix/logs/parix-aegis-error.log
```

```powershell
# Windows
Get-Content "$env:LOCALAPPDATA\Parix\logs\parix-hands-error.log" -Tail 200
Get-Content "$env:LOCALAPPDATA\Parix\logs\parix-atrium-error.log" -Tail 200
Get-Content "$env:LOCALAPPDATA\Parix\logs\parix-aegis-error.log" -Tail 200
```

Redact API keys before posting publicly. (The logs *should* never contain
them, but check.)

### 5. What you expected vs. what happened

> Expected: Aegis UI shows the dashboard with my recent activity.
> Actual: Stuck on the loading spinner. F12 console shows
> `WebSocket connection failed: ws://127.0.0.1:8766` repeating every 2s.

## Security issues — don't file these publicly

If you find any of the following, email Suhas (do not open a GitHub issue):

- Anything that lets a remote site read your local Parix data or memory.db.
- Anything that lets a third-party skill exfiltrate API keys.
- Synapse accepting connections it shouldn't (default bind is `127.0.0.1`
  only; if you see otherwise, that's a bug).
- LLM prompt injection that causes Parix to take a destructive action
  without the approval gate firing.

We'll respond within 48h, fix, and credit you (or stay anonymous, your
choice) in the changelog.

## What we promise

- A first response within 3 working days.
- A triage label (`bug`, `enhancement`, `question`, `wontfix`) on every
  filed issue within a week.
- A weekly digest in the alpha Matrix/Discord of what's been fixed.

## What we'd love but won't always do

- Same-day fixes. Most won't be.
- Backporting fixes to older versions. Alpha = upgrade is the fix.
- Feature requests. We're focused on stability through Phase 1/2; new
  features land Phase 3 and later. File them anyway — we read them all.
