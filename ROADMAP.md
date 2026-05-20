# Parix — Roadmap v1

Last updated: 2026-05-20. Authoritative A-to-Z plan from local-dev code to a
scaled v1.0 release. Five phases, each with exit criteria.

This file supersedes `SHIP-PLAN.md` (which is preserved as the historical
record of the v0.2 push). When something lands, edit this file in place —
strike through the item and mark it `✅ Done <date>`. Do not let it drift.

> **Companion docs:**
> - `SHIP-PLAN.md` — historical v0.2 plan (Tracks A/B/C, D/E/F/G). Many of the
>   line items below are summaries of work tracked there in finer detail.
> - `agents.md` — the long-form architecture + module assignment doc.
> - `memory/project_roadmap_v1.md` — why this file exists; canonical pointer
>   for future Claude sessions.

---

## Phase 0 — Make the install actually work on a fresh VM

**Goal:** a non-developer on a clean Windows 10 VM can run the one-liner and
reach an Aegis prompt without manual intervention. This is the gate to
alpha. Nothing in Phase 1 is real value until this gate is green.

| # | Item | Owner | Status |
|---|---|---|---|
| 0.1 | Fresh Win10 VM install test — run `install.ps1` end-to-end from a clean snapshot, log every failure | Claude + Suhas `[HUMAN]` | open — needs a Win10 VM |
| 0.2 | ~~`install.ps1` / `install.sh` idempotent + clear errors on every failure mode~~ ✅ Done 2026-05-20 — broken regex fixed, admin/sudo preflight added, per-OS install hints. | Claude | done |
| 0.3 | ~~SQLite migrations run cleanly on an empty machine; no manual schema steps~~ ✅ Done 2026-05-20 — schema uses `IF NOT EXISTS` throughout; existing `atrium/tests/integration/sqlite.test.ts` proves cold-start init from an empty file. | Claude | done |
| 0.4 | ~~Atrium → Hands → Aegis boot order is deterministic; pm2/ecosystem config survives reboot~~ ✅ Done 2026-05-20 — boot order documented in `docs/boot-order.md`. | Claude | done |
| 0.5 | ~~Hatchery TUI completes profile creation end-to-end without crash on a fresh machine~~ ✅ Done 2026-05-20 — audit found no fresh-machine crash paths; inquirer + EADDRINUSE + PM2 failure all handled. | Claude | done |
| 0.6 | ~~First-run check reports missing deps in plain English (not a stack trace)~~ ✅ Done 2026-05-20 — `parix onboarding --check` now lists every missing dep with an OS-specific fix command, exits non-zero on critical misses. | Claude | done |
| 0.7 | ~~Skills directory bootstrapped, default skill set loadable on first boot~~ ✅ Done 2026-05-20 |  Claude | done |
| 0.8 | ~~App icons in place (Windows `.ico`, macOS `.icns`, Linux `.png`); installer registers them~~ ✅ Done 2026-05-20 | Claude | done |

**Exit criteria:**
- A fresh Win10 VM, given only the one-line installer, reaches the Aegis
  prompt in <10 minutes with no human touch beyond UAC.
- The same on macOS and Linux VMs (the `[HUMAN]` blockers from
  SHIP-PLAN.md B3/C3 carry over here).
- `install.ps1 -DryRun` reports every dependency it would touch.

---

## Phase 1 — Private alpha (5–20 trusted testers)

**Goal:** real humans, on their own hardware, run Parix for a week without
Suhas intervening. Bug reports, not crash reports.

| # | Item | Owner | Notes |
|---|---|---|---|
| 1.1 | `parix.ai` domain registered + DNS pointed | Suhas `[HUMAN]` | open |
| 1.2 | GitHub repo flipped public-read; LICENSE, CONTRIBUTING, CODE_OF_CONDUCT in shape | Claude | docs ready |
| 1.3 | Cloudflare Worker hosts the one-liner installer at `install.parix.ai` | Codex | open — depends on 1.1 |
| 1.4 | ~~Quickstart, troubleshooting, "how to file a bug" docs~~ ✅ Done 2026-05-20 — `docs/quickstart.md`, `docs/troubleshooting.md`, `docs/filing-bugs.md`. | Claude | done |
| 1.5 | ~~Crash reporter wired into Atrium + Hands + Aegis~~ ✅ Done 2026-05-20 — opt-in, anonymized payload, no-op until `telemetry.enabled + consentedAt + endpoint` are all set. Modules: `atrium/src/diagnostics/crash-reporter.ts`, `hands/diagnostics/crash_reporter.py`, `aegis/src/diagnostics/crashReporter.ts`. | Claude | done |
| 1.6 | ~~Auto-updater wired against the `UpdateChecker` endpoint from SHIP-PLAN D1~~ ✅ Done 2026-05-20 — `UpdateChecker` instantiated in `atrium/src/index.ts`, broadcasts `UPDATE_AVAILABLE` over the Aegis relay. Never auto-installs. Server-side endpoint still open (Phase 2). | Claude | done |
| 1.7 | Recruit 5–20 testers; private Discord / matrix room for them | Suhas `[HUMAN]` | open |
| 1.8 | ~~Tester onboarding doc: "what to expect, what to report, how to roll back"~~ ✅ Done 2026-05-20 — `docs/tester-onboarding.md`. | Claude | done |

**Exit criteria:**
- ≥5 testers have Parix installed on hardware Suhas does not own.
- ≥3 of them have used it daily for a week.
- Crash reports flow to the dashboard; mean time-to-diagnose <24h.
- Auto-update has shipped at least one real patch to testers without manual
  re-install.

---

## Phase 2 — Public beta

**Goal:** anyone on the internet can install Parix, the binaries are
trusted by the OS, and we have a story for skills written by other people.

| # | Item | Owner | Notes |
|---|---|---|---|
| 2.1 | Windows code-signing pipeline in CI (cert + signtool) | Codex | SHIP-PLAN D2 |
| 2.2 | macOS notarization pipeline in CI (Apple Developer cert) | Codex | SHIP-PLAN D3 |
| 2.3 | Linux packaging — pick one of `.deb` / AppImage / Flatpak to start, document the others | Codex | SHIP-PLAN D4 |
| 2.4 | CI pipeline: build → sign → notarize → publish release → push to update feed | Codex | end-to-end |
| 2.5 | Telemetry opt-in (`telemetry.consentedAt` already on profile per SHIP-PLAN E2); backend chosen + `docs/privacy.md` final | Suhas `[HUMAN]` + Claude | E4 unblocker |
| 2.6 | Real skill permission gate before opening any third-party skill registry — per SHIP-PLAN E3a | Claude | launch blocker if E3a left undone |
| 2.7 | Synapse remote-bind gate (`PARIX_ALLOW_REMOTE_SYNAPSE`) + shared-secret handshake | Codex | SHIP-PLAN E3b |
| 2.8 | Skill marketplace review process documented; first 3 third-party skills landed | Claude | small batch |
| 2.9 | Marketplace API on a real DB (Postgres), behind Cloudflare | Codex | replaces SHIP-PLAN stub |
| 2.10 | Provider API key flow smoke tests across all 13 providers | Codex `[HUMAN]` for accounts | SHIP-PLAN F1 |

**Exit criteria:**
- Signed binaries for Windows + macOS available at `parix.ai/download`.
- Auto-update has shipped a patch to public users without breakage.
- Telemetry flowing from consenting users; opt-in rate documented.
- ≥3 third-party skills reviewed and live in the marketplace.
- Synapse no longer trusts non-localhost connections by default.

---

## Phase 3 — Public v1.0 launch

**Goal:** cut the 1.0 tag. Story is tight enough to defend on Hacker News
and against the inevitable "isn't this just OpenClaw" thread.

| # | Item | Owner | Notes |
|---|---|---|---|
| 3.1 | External security audit (or thorough internal pass against `docs/security-audit-v0.2.md`) | Suhas `[HUMAN]` | budget call |
| 3.2 | Threat model documented (`docs/threat-model.md`) | Claude | data flows, trust boundaries, abuse cases |
| 3.3 | Docs site on Astro Starlight (or similar) — quickstart, skills, accessibility moat, security model | Claude | SHIP-PLAN G2 |
| 3.4 | Comparison page vs OpenClaw + generic GPT-4V agents | Claude | SHIP-PLAN G3 |
| 3.5 | README rewrite — public-facing, with Aegis screenshots | Claude | SHIP-PLAN G1 |
| 3.6 | Trademark filing for "Parix" | Suhas `[HUMAN]` | |
| 3.7 | Press kit: logos, screenshots, one-pager, demo GIF | Claude + Suhas | |
| 3.8 | Demo video — Suhas screen-recording a real workflow | Suhas `[HUMAN]` | SHIP-PLAN G4 |
| 3.9 | Launch-day coordination: HN, ProductHunt, X, dev newsletters | Suhas | calendar |

**Exit criteria:**
- v1.0 tag cut and signed binaries published.
- Docs site live at `docs.parix.ai`.
- Security audit findings either fixed or publicly disclosed with mitigations.
- Launch day executed (HN front page is bonus, not gate).

---

## Phase 4 — Scale

**Goal:** the edges of the system (install server, update feed, marketplace
API) survive being noticed. Parix itself is local-first, so most of the
agent runs on the user's box — the scale work is the cloud surface.

| # | Item | Owner | Notes |
|---|---|---|---|
| 4.1 | Install server behind a CDN, cache headers tuned, integrity hashes published | Codex | |
| 4.2 | Update feed split by channel (stable/beta/nightly) with rollback | Codex | |
| 4.3 | Marketplace API horizontally scalable; read replicas; rate limiting | Codex | |
| 4.4 | Public status page (`status.parix.ai`) — install server, update feed, marketplace, auth | Codex | |
| 4.5 | Observability: structured logs + dashboards for the cloud surface | Codex | |
| 4.6 | Incident runbook + on-call rotation (Suhas + 1) | Suhas `[HUMAN]` | |

**Exit criteria:**
- Install server sustains a 10× traffic spike (e.g. launch-day) without
  manual intervention.
- Marketplace API p99 <200ms under steady load.
- A regional cloud outage degrades the install/update surface but does not
  break already-installed Parix instances (local-first invariant verified).

---

## Honest blocker summary (carried from SHIP-PLAN.md)

These compress with zero extra agent-hours:

1. Real Mac for SHIP-PLAN B3 (Phase 0 / Phase 1).
2. Real Linux box for SHIP-PLAN C3 (Phase 0 / Phase 1).
3. Code-signing certs + Apple Developer account (Phase 2).
4. Telemetry / privacy backend decision (Phase 2).
5. Provider accounts for smoke tests (Phase 2).
6. Suhas on camera for the demo video (Phase 3).
7. Trademark + security-audit budget (Phase 3).

Unblock 1–4 early. Without them, Phase 2 cannot ship even if every Phase 0
and Phase 1 item is green.
