# Parix privacy policy

Last updated: 2026-05-18 (v0.2 — planned for v1.0 launch).

Parix is built so that **the default state is silent**. Nothing is sent to
any Parix-operated server unless you turn it on. This document covers
what Parix *can* send when you opt in, what it never sends regardless,
and how to turn it off.

If the code in `atrium/` or `hatchery/` ever conflicts with what is
written here, **the policy below is the contract** — file a bug.

---

## Default state

A fresh Parix install runs **entirely on your machine**. The only
network calls Parix makes by default are:

1. **The LLM provider you chose during onboarding.** This is your
   relationship with OpenAI / Anthropic / OpenRouter / etc. — their
   privacy policies apply, not Parix's. Parix is a client.
2. **The update endpoint** (`https://updates.parix.dev/v1/check` by
   default). One GET request at startup and every six hours after,
   carrying only:
   - the current Parix version (e.g. `0.2.0`),
   - the OS family (`windows` / `macos` / `linux`),
   - the release channel (`stable` / `beta`).
   It carries no identifier, no IP-tied account, no profile data. You
   can disable it (`updates.autoCheck = false`) or point it at your
   own mirror (`updates.endpoint`).

That is everything in the default state. Nothing else leaves your
machine.

## What telemetry covers (when you opt in)

If — and only if — you answer **yes** to the telemetry question during
`hatchery` onboarding (or set `telemetry.enabled = true` in your
profile and provide a `consentedAt` timestamp), Parix will additionally
send:

- **Crash reports.** When `hands`, `atrium`, or `aegis` crashes, Parix
  uploads a stack trace and the version of the affected component.
  Stack traces never contain user input — they contain function names,
  filenames, and line numbers from Parix's own source.
- **Aggregate startup counts.** Once per process start, a single ping
  carrying `{ component, version, platform }`. This is what tells us
  how many people are actually running v0.2.

That's the full list. Telemetry is **off** in every fresh profile.

## What Parix never sends — opt-in or not

The following are **never** sent to any Parix-operated server,
regardless of your telemetry choice:

- **Prompts you typed.** Anything you said to your agent stays between
  you and your LLM provider.
- **LLM responses.** Same.
- **Channel messages.** Slack, Discord, Telegram, iMessage, email —
  if it goes through a Parix channel adapter, it goes to the channel
  service and nowhere else.
- **File contents.** Documents Parix reads on your behalf stay on
  your disk and (when needed) in the LLM round-trip you authorized.
- **Screen contents / OCR results.** The accessibility moat
  (`hands/accessibility/`) runs locally. When the vision OCR route
  is engaged (v0.2+), the screenshot goes to your chosen LLM
  provider, not to Parix.
- **Names, emails, identifiers.** Your `identity.name`,
  `agentName`, `companyName`, etc. all live in
  `~/.parix/profile.json` and never leave.
- **API keys and credentials.** These live in your OS keychain
  (via `keytar`) or `.env` and are not transmitted by Parix.

## Where your data actually lives

| What | Where | Sent off-machine? |
|---|---|---|
| Onboarding profile | `~/.parix/profile.json` | No |
| Skill registry | `~/.parix/skills/` | No |
| API keys, bot tokens | OS keychain / `.env` | No (only on requests you initiate to that vendor) |
| Conversation history | `~/.parix/memory.db` (SQLite) | No |
| Accessibility snapshots | `~/.parix/memory.db` table `accessibility_snapshots` | No |
| Vision OCR images | In-flight only — sent to your LLM provider when the vision route runs; not persisted by Parix | To LLM provider only |
| Logs | `~/.parix/logs/` | No (unless telemetry on, and then only crash stacks) |

## Turning telemetry off after the fact

Edit `~/.parix/profile.json`:

```json
"telemetry": {
  "enabled": false,
  "consentedAt": null
}
```

Restart any running Parix processes. There is no separate "stop"
signal — `enabled: false` is checked on every emission attempt.

## Turning the update check off

```json
"updates": {
  "autoCheck": false
}
```

Or point it at your own static manifest server:

```json
"updates": {
  "endpoint": "https://updates.example.internal"
}
```

The endpoint contract is documented in
[`atrium/src/updates/checker.ts`](../atrium/src/updates/checker.ts) —
it's three static JSON files behind a CDN.

## Enterprise deployments

For enterprise installs (`mode: "enterprise"`), the recommended posture
is:

```json
"telemetry": { "enabled": false, "consentedAt": null },
"updates":   { "autoCheck": false, "endpoint": "<your-mirror>" }
```

This makes Parix a fully air-gappable agent runtime: no Parix-operated
endpoint is contacted, only your chosen LLM provider and your channel
backends.

## Reporting

If you find Parix sending something not described here, that is a
**bug, not a feature**. File it at the repo issue tracker; this
document is the contract.
