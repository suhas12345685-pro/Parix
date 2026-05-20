# Threat model

This document describes who might attack Parix, how, and what we do (and
don't) defend against. Pair it with `docs/security-audit-v0.2.md` (point-
in-time findings) and `docs/privacy.md` (what data leaves the box and when).

## Trust boundaries

```
┌──────────────────────── User's machine ────────────────────────┐
│                                                                │
│  ┌───── Aegis UI ──────┐   ┌── Hatchery (one-shot CLI) ──┐     │
│  │  React SPA          │   │  Profile editor, dep check   │     │
│  └────────┬────────────┘   └─────────────┬────────────────┘     │
│           │ WS 8766                       │ writes ~/.parix     │
│  ┌────────▼────────────────────────────────▼───────────┐        │
│  │  Atrium  (Node 20+)                                  │        │
│  │  Council, LLM router, Synapse client, audit chain    │        │
│  └────────┬─────────────────────────────┬───────────────┘        │
│           │ WS 8765 (loopback + AUTH)   │ HTTPS (LLM, telemetry, │
│           │                              │        update feed)    │
│  ┌────────▼────────────────────┐         │                        │
│  │  Hands  (Python 3.12+)       │         │                        │
│  │  Sensors, OS accessibility,  │         │                        │
│  │  executor, vision            │         │                        │
│  └─────────────────┬────────────┘         │                        │
│                    │ native OS APIs       │                        │
│  ┌─────────────────▼────────────────────┐ │                        │
│  │  Operating system                    │ │                        │
│  │  (UIA / AXAPI / AT-SPI2, screen,     │ │                        │
│  │   process, filesystem)               │ │                        │
│  └──────────────────────────────────────┘ │                        │
└────────────────────────────────────────────┼────────────────────────┘
                                              │
                                  ┌───────────▼───────────┐
                                  │  LLM provider(s)      │
                                  │  (OpenAI, Anthropic,  │
                                  │   Gemini, …)          │
                                  └───────────────────────┘
                                  ┌───────────────────────┐
                                  │  updates.parix.dev    │
                                  │  (static JSON)        │
                                  └───────────────────────┘
                                  ┌───────────────────────┐
                                  │  Crash report endpoint│
                                  │  (only when opted in) │
                                  └───────────────────────┘
```

**Boundaries that matter:**

1. **Localhost loopback.** Synapse (8765) and the Aegis relay (8766) bind
   to `127.0.0.1` only by default. Anything else requires
   `PARIX_ALLOW_REMOTE_SYNAPSE=1` (Phase 2.7).
2. **Shared-secret AUTH.** Even on loopback, the first WS frame must be
   `{type:"AUTH", token:<64 hex chars>}`. Token lives at
   `$PARIX_HOME/synapse-token`, mode 0600 on POSIX. No token → connection
   closed with code 4401.
3. **Profile-gated egress.** Telemetry, crash reports, and update polls
   are all default-off and only fire when `profile.telemetry.enabled +
   consentedAt` are set (or the update endpoint is configured).
4. **LLM provider trust.** We assume the configured LLM provider sees the
   prompts we send it. Don't put secrets the user wouldn't share with the
   provider in the prompt. Constitution rules enforce a list of redactions.

## Actors

| Actor | Capabilities | Motivation |
|---|---|---|
| **Legitimate user** | Full local access; controls `~/.parix`. | Wants the agent to be useful and not break things. |
| **Other local user** on shared machine | Can read processes, possibly the user's home dir if perms are loose. | Snoop on memory.db, grab API keys from .env. |
| **LAN attacker** | Can probe ports on user's IP. | Pivot from a compromised laptop. |
| **Malicious third-party skill author** | Authors a skill, gets it published in the marketplace. | Exfiltrate data, gain code execution. |
| **Compromised LLM provider** | Returns crafted responses. | Trigger destructive actions via prompt injection. |
| **Network attacker (passive)** | Sniffs traffic between user and providers. | Read prompts in flight (mitigated by HTTPS). |
| **Compromised update server** | Serves malicious update manifest. | Push a backdoor to every installed Parix. |
| **State-level adversary** | All of the above + endpoint compromise. | Out of scope for v1.0. |

## Asset inventory (what we're protecting)

1. **Process / filesystem control.** Hands can execute commands. A
   successful exploit here owns the machine.
2. **LLM API keys** in `~/.parix/.env`. Stolen keys = stolen quota.
3. **Channel credentials** in `~/.parix/profile.json` /
   `~/.parix/secrets/*`. Stolen Telegram bot token = the agent can be
   impersonated; stolen Discord token = read message history.
4. **Memory DB** at `~/.parix/data/memory.db`. Contains audit log of
   actions, recent events, accessibility snapshots. Privacy-sensitive.
5. **Onboarding profile.** Reveals what apps the user runs, who they
   report to, what they consider blocked vs. allowed.
6. **Identity of the user as the agent author** in any external message
   the agent sends.

## Attack scenarios

### S1 — Other local user reads memory.db
**Likelihood:** medium (shared dev workstations exist).
**Impact:** high (audit log of actions, recent prompts).
**Mitigation:** `~/.parix/` defaults to user's home perms (700 on POSIX).
Windows ACL on `%LOCALAPPDATA%\Parix` is per-user by default.
**Residual risk:** if the user `chmod 755 ~/.parix` (e.g. trying to fix a
permission error), data is exposed. The installer warns; we should add a
periodic check.

### S2 — Network attacker on the same LAN connects to Synapse
**Likelihood:** low without misconfig.
**Impact:** critical (control of Hands = code execution).
**Mitigation:** default bind 127.0.0.1. Non-loopback bind is gated on
`PARIX_ALLOW_REMOTE_SYNAPSE=1` *and* requires the AUTH token. The token
is 256 bits — not brute-forceable in any realistic timeframe.
**Residual risk:** if the user copies `~/.parix/synapse-token` to a
disk-share, the token leaks. Token rotation is a TODO for Phase 4.

### S3 — Malicious third-party skill
**Likelihood:** rises as the marketplace grows.
**Impact:** medium-high (skill runs with user perms, can call OS APIs
through hands).
**Mitigation:**
- All marketplace skills must declare `permissions` in their manifest;
  the marketplace review process (`docs/skill-marketplace-review.md`) is
  the human gate.
- The agent self-governs via policy/approval — destructive actions still
  hit the Constitution + reversibility checks.
- Skill output is logged in the audit ledger so post-hoc forensics works.

**What we do NOT do:** per-skill OS-level sandboxing. Skills run in the
same Python / Node process as the agent. A malicious skill that gets past
review can do anything the agent can. This is an intentional trade-off —
sandboxing every skill makes the moat-defining accessibility integrations
prohibitively expensive.

### S4 — Compromised LLM provider / prompt injection
**Likelihood:** medium (prompt injection from web content is common).
**Impact:** medium (could cause unwanted actions; the Constitution
should refuse the worst).
**Mitigation:**
- Constitution rules block destructive actions even when the LLM asks
  for them. Reversibility score < 0.5 → requires user approval.
- Audit ledger records every decision with the prompt that produced it.
- Personal mode defaults to `safe-auto-fix` autonomy; Enterprise mode
  defaults to `always-ask`.

**Residual risk:** a clever prompt injection that produces a sequence of
individually-reversible actions adding up to harm. Mitigation: shadow-
prompt monitoring + situation fusion. Not perfect.

### S5 — Compromised update server
**Likelihood:** low for now (`updates.parix.dev` doesn't exist yet); rises
once it does.
**Impact:** critical (push a backdoor to every install).
**Mitigation:**
- `UpdateChecker` polls but **never auto-installs**. The user chooses to
  apply the update from the Aegis prompt.
- Once installer signing lands (Phase 2.1 / 2.2 — code signing certs),
  the installer verifies the publisher signature before running.
- Update manifest includes a SHA-256 of the archive; the installer
  re-checks before applying.
- Long-term: pin the update server's TLS leaf cert in the binary, or
  use signed manifests (TUF-style).

**Residual risk:** until code signing lands, a compromised update server
*plus* a compromised user could push malware. Don't trust the network.

### S6 — Crash report exfiltration
**Likelihood:** low (default off).
**Impact:** low.
**Mitigation:** crash payload is whitelisted by field
(`process, version, ts, os, arch, errorClass, errorMessage[:1000],
stack[:4000], fatal`). No user content. See
`atrium/src/diagnostics/crash-reporter.ts` for the full schema.
**Residual risk:** an error message that the user typed (e.g. "filename
contains my SSN") leaks via `errorMessage`. We truncate to 1000 chars but
don't strip; this is a known trade-off — more sophisticated PII scrubbing
is a Phase 3 ask.

### S7 — Telegram / Discord bot impersonation
**Likelihood:** medium (any leaked bot token gives this).
**Impact:** depends on what the agent can do via that channel.
**Mitigation:** tokens live in `~/.parix/secrets/*`, not in profile.json
or .env. Permission to send external messages requires user approval in
Personal mode, or the approval gate in Enterprise. Audit logs every
outbound message.
**Residual risk:** there's no good defense if the bot token is genuinely
leaked. Document rotation in `docs/security.md`.

## Out of scope

- **Hardware attacks** (cold-boot, evil-maid, side-channel). If your
  laptop is in someone else's hands, Parix is the least of your problems.
- **Compromised host OS.** A rooted laptop can do anything; Parix sits
  inside the trust boundary.
- **Quantum cryptographic attacks** on the update-server TLS. We'll
  cross that bridge when there's a real quantum computer.
- **Supply-chain attacks on Node/Python/PyPI dependencies.** Best we can
  do: `npm ci` with a committed lockfile, `pip install --require-hashes`
  (TODO Phase 2). The marketplace API will have a vetted-dependency
  allowlist; the agent core won't.

## What gets re-reviewed when

- **Every release:** the audit ledger schema, the Constitution rule
  list, the redaction list.
- **Every quarter:** this document.
- **On any "I've found a way around the approval gate" report:** all of
  the above + the Synapse handshake.

## Reporting a vulnerability

See `docs/filing-bugs.md` § Security issues. Email Suhas, do not open a
public GitHub issue.
