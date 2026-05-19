# Ship Plan — Path from v0.1.7-alpha to v1.0

Last updated: 2026-05-18. Authoritative split between Claude and Codex for the
remaining ship work. Update this file when scope changes; don't let it drift.

Estimates are **agent-hours**, not human-hours. Items gated by hardware or
external accounts are flagged `[HUMAN]` and won't compress no matter how
many agents run in parallel.

---

## Current state

- v0.1.7-alpha (2026-05-18): Gemini OCR hardcode removed from
  `hands/accessibility/vision.py`. Tesseract-only until the router
  integration below lands.
- v0.1.6-alpha (2026-05-17): accessibility moat live end-to-end. Phase 4
  hardening closed.
- Live backends: Windows (production). macOS + Linux files exist but are
  unverified on real hardware.

---

## v0.2 — three tracks

### Track A — Vision OCR via atrium LLM router

Replace the removed Gemini fallback. Multimodal LLM does the OCR directly;
tesseract is fallback for text-only providers; empty text when neither
works. Full plan in
`~/.claude/projects/.../memory/project_vision_router_plan.md`.

| # | Task | Owner | Files | Est |
|---|---|---|---|---|
| A1 | ✅ Done (Claude, 2026-05-18) — `images?: LLMImage[]` on `LLMRequest`; `supportsImages?: boolean` on `LLMProvider` | Claude | `atrium/src/llm/types.ts` | 10m |
| A2 | ✅ Done (Claude, 2026-05-18) — `vision` route added; router skips providers where `supportsImages !== true` when `images` present | Claude | `atrium/src/llm/router.ts` | 15m |
| A3 | ✅ Done (Claude, 2026-05-18) — Anthropic builds multimodal `{type:"image", source:{type:"base64",...}}` content blocks | Claude | `atrium/src/llm/adapters/anthropic.ts` | 20m |
| A4 | ✅ Done (Claude, 2026-05-18) — OpenAI/OpenRouter build `image_url` content with data URLs | Claude | `atrium/src/llm/adapters/openai.ts` | 20m |
| A5 | ✅ Done (Codex, 2026-05-18) — protocol now includes `VISION_OCR_REQUEST` and `VISION_OCR_RESPONSE`; Python dataclass mirrors added for both message shapes | Codex | `shared/protocol.json`, `hands/protocol.py` | 15m |
| A6 | ✅ Done (Claude, 2026-05-18) — `vision-handler.ts` dispatches `VISION_OCR_REQUEST` through `router.complete(..., "vision")`, always sends a `VISION_OCR_RESPONSE` (with `error` set on `no-router`/`no-image`/router-failure so hands tesseract-falls-back fast); `SynapseClient.setLLMRouter()` wired in `index.ts`; 4 new handler tests | Claude | new: `atrium/src/synapse/vision-handler.ts`, `atrium/src/synapse/__tests__/vision-handler.test.ts`; touch: `atrium/src/synapse/client.ts`, `atrium/src/index.ts` | 30m |
| A7 | ✅ Done (Codex, 2026-05-18) — `VisionBackend` now sends screenshot OCR through Synapse first with request/future correlation and falls back to local tesseract on timeout, router error, empty OCR, or missing Atrium; poller websocket now handles OCR responses | Codex | `hands/accessibility/vision.py`, `hands/main.py`, `hands/sensors/a11y_poller.py`, `hands/accessibility/__init__.py` | 30m |
| A8 | ✅ Done (Claude, 2026-05-18) — router test verifies image-bearing requests skip text-only providers and reach vision-capable; existing "no-vision-route" test flipped | Claude | `atrium/src/llm/__tests__/router.test.ts` | 15m |
| A9 | ✅ Done (Codex, 2026-05-18) — mock websocket round-trip covers `VISION_OCR_REQUEST` relay to Atrium, `VISION_OCR_RESPONSE` return to the requesting Hands client, router-first OCR, and tesseract fallback on router error | Codex | new: `hands/tests/test_vision_synapse.py` | 20m |
| A10 | ✅ Done (Claude, 2026-05-18) — Unreleased v0.2 entry added; v0.1.7 "Deferred" stanza points at it | Claude | `CHANGELOG.md` | 5m |

**Track A total: ~3h agent-time. No human blockers.**

### Track B — macOS native a11y backend to production

Status unknown until someone reads the file. Either 30min polish or
several hours of pyobjc work.

| # | Task | Owner | Files | Est |
|---|---|---|---|---|
| B1 | ✅ Done (Claude, 2026-05-18) — see audit below. Implements `get_tree()`; structurally complete but has 3 real-Mac risks. | Claude | `hands/accessibility/macos.py` | 20m |
| B2 | ✅ Done (Codex, 2026-05-18) — macOS backend now gates native reads with `AXIsProcessTrusted()`, unwraps PyObjC tuple-return AX calls, and normalizes `AXValueGetValue` CGPoint/CGSize forms; covered with mocked ApplicationServices tests | Codex | `hands/accessibility/macos.py`, `hands/tests/test_accessibility.py` | 1–2h |
| B3 | `[HUMAN]` Test on a real Mac: launch Parix, focus 3 different apps (Safari, Terminal, a native app), confirm `ACCESSIBILITY_SNAPSHOT` rows show `backend_used: "axapi"` with correct focused elements. **NOTE: file uses `"axapi"`, not `"axui"` as originally written here.** | Suhas | — | — |
| B4 | ✅ Done (Claude, 2026-05-18) — macOS permission flow, verification command, known B2 issues all in `docs/accessibility-plan.md` "Platform setup" section | Claude | `docs/accessibility-plan.md` | 15m |

**B1 audit (2026-05-18):** `macos.py` implements the full `AccessibilityBackend`
protocol — one method, `async get_tree()`. Walks the system-wide
`AXUIElement`, resolves `AXFocusedApplication` + `AXFocusedUIElement`, extracts
role/title/value/state/bounds, depth-capped at 8, child-capped at 50. No stubs,
no `NotImplementedError`. Three risks for real-Mac runs: (1) `_bounds()` does
`int(position.x)` — under pyobjc, `AXPosition`/`AXSize` are CFType handles, not
plain objects with `.x`/`.width`. Needs `AXValueGetValue` + struct unpack.
(2) Some pyobjc versions return `(error, value)` tuples from
`AXUIElementCopyAttributeValue`; current code treats the return as the raw
value. (3) No `AXIsProcessTrusted()` gate — first run with no permission will
silently produce empty trees.

**Track B total: ~1–2h agent-time + 1h human verification on a Mac** (revised
down post-audit; previous range assumed worst-case rewrite).

### Track C — Linux native a11y backend to production

Same shape as Track B, with AT-SPI2 via D-Bus.

| # | Task | Owner | Files | Est |
|---|---|---|---|---|
| C1 | ✅ Done (Claude, 2026-05-18) — see audit below. Linux is in better shape than macOS: structurally complete *and* the APIs it uses are the right ones. | Claude | `hands/accessibility/linux.py` | 20m |
| C2 | ✅ Done (Codex, 2026-05-18) — Linux backend now prefers `get_child_at_index(i)` for raw `gi.repository.Atspi.Accessible` and falls back to index access for pyatspi; covered with mocked AT-SPI tests | Codex | `hands/accessibility/linux.py`, `hands/tests/test_accessibility.py` | 30–60m |
| C3 | `[HUMAN]` Test on a Linux box with AT-SPI2 enabled (`gsettings set org.gnome.desktop.interface toolkit-accessibility true`); focus apps, confirm `backend_used: "atspi"` snapshots | Suhas | — | — |
| C4 | ✅ Done (Claude, 2026-05-18) — AT-SPI2 enable (gsettings + QT_ACCESSIBILITY), distro install commands, verification, known C2 issue all in `docs/accessibility-plan.md` "Platform setup" section | Claude | `docs/accessibility-plan.md` | 15m |

**C1 audit (2026-05-18):** `linux.py` implements the full
`AccessibilityBackend` protocol — `async get_tree()` only. Imports `pyatspi`
with `gi.repository.Atspi` fallback. Uses `Registry.getDesktop(0)` +
`findFocusedObject`, walks children, extracts role via `getRoleName`, text via
`queryText().getText(0, -1)`, bounds via `queryComponent().getExtents(0)`
(coord type 0 = screen). States map from `STATE_FOCUSED/ENABLED/SELECTED/
EXPANDED/VISIBLE`. No stubs. The single concrete gap: child indexing via
`element[i]` only works on the legacy `pyatspi` module — under the
`gi.repository.Atspi` fallback the equivalent is `element.get_child_at_index(i)`.

**Track C total: ~1h agent-time + 1h human verification on Linux** (revised
down post-audit; previous range assumed worst-case rewrite).

### v0.2 grand total: ~5–7h agent-time (was 7–13h). Hard human blockers: Mac + Linux access.

---

## v1.0 — public launch

### Track D — Distribution

| # | Task | Owner | Est |
|---|---|---|---|
| D1 | ✅ Done (Claude, 2026-05-18) — endpoint contract documented at top of `atrium/src/updates/checker.ts` (`GET /v1/check?platform=&channel=&version=` → 200 with `{latest,url,sha256,releaseNotes,mandatory,publishedAt}` or 204); `UpdateChecker` polls at startup + on interval, emits on newer-version detection, never auto-installs; profile gains `updates: {channel, endpoint, pollIntervalMs, lastCheckedAt, autoCheck}` (default endpoint `https://updates.parix.dev`); 8 new tests cover semver compare + 204/200/500/network/malformed paths. Server impl is D2/D3/D4's job once D5 cert/domain land. | Claude | 2h |
| D2 | Windows MSI / EXE signing pipeline in CI; Squirrel.Windows or similar for updates | Codex | 2h |
| D3 | macOS `.app` notarization pipeline | Codex | 2h |
| D4 | Linux `.deb` / AppImage / Flatpak — pick one to start | Codex | 2h |
| D5 | `[HUMAN]` Apple Developer cert ($99/yr), Windows code-signing cert (~$200/yr), domain for update endpoint | Suhas | — |

### Track E — Trust surface

| # | Task | Owner | Est |
|---|---|---|---|
| E1 | Crash reports wired into hands + atrium + aegis (Sentry or self-hosted) | Codex | 2h |
| E2 | ✅ Done (Claude, 2026-05-18) — `telemetry: {enabled, consentedAt}` on profile (default off, validator forbids `enabled=true` without `consentedAt`); `collectTelemetry()` step in hatchery TUI between modules and personality, default-no, clear what-is-and-isn't-sent prompt copy; full `docs/privacy.md` documenting the contract (default state, opt-in scope, never-list, enterprise air-gap recipe). | Claude | 1h |
| E3 | ✅ Done (Claude, 2026-05-18) — audit at `docs/security-audit-v0.2.md`: 7 findings (2 HIGH, 2 MEDIUM, 3 LOW). Finding 1 (self-approval bypass via `payload.approved`) **fixed in this pass** — the dead-code bypass is removed and the new approval-context contract is sketched in code comments. Finding 6 (synapse has no auth) is closed in row E3b below. Finding 2 (skill permission gate is a no-op) is **closed as won't-fix by design** (2026-05-19): trust boundary lives at the policy/approval layer in both Enterprise and personal mode, not at per-skill manifest grants. | Claude | 1h audit + 30m fix |
| E3b | ✅ Done (Claude, 2026-05-19) — `_enforce_bind_policy()` refuses non-loopback `PARIX_WS_HOST` without `PARIX_ALLOW_REMOTE_SYNAPSE=1`; `hands/auth/token.py` + `atrium/src/synapse/token.ts` resolve a shared secret from env → `~/.parix/synapse-token` → auto-generate-and-persist; `connection_handler` requires `SYNAPSE_AUTH` (compared with `secrets.compare_digest`) from non-loopback peers within 5s, closes with WS 4401 on mismatch; `SynapseClient.connect()` sends `SYNAPSE_AUTH` on open. Docker compose + k8s + .env.example updated. 14 new tests (9 hands, 5 atrium). | Claude | done |
| E4 | `[HUMAN]` Decide telemetry backend + own privacy story | Suhas | — |

### Track F — Onboarding polish

| # | Task | Owner | Est |
|---|---|---|---|
| F1 | Smoke-test each of the 13 providers' API key flow end-to-end | Codex | 13×30m = 6.5h |
| F2 | Smoke-test account-auth flows where supported (OpenAI, Anthropic CLI, etc.) | Codex | 4h |
| F3 | ✅ Done (Claude, 2026-05-19) — `aegis/src/components/FirstRunBoot.tsx` overlays a 4-step boot checklist (Aegis relay → Atrium → Hands → Sensors) with a gradient progress bar that fills as each subsystem reports in; auto-dismisses 1.5s after all steps green; manual "Skip to dashboard" exit. `aegis/src/components/NowPanel.tsx` is a persistent footer strip (every page) showing engine-state badge with pulsing dot, primary activity (plan goal → attention focus → latest event), supporting context (active plan node / accessibility focus), plan progress, queue depth, and hands status. Verified in dev server: boot overlay renders, dismiss works, panel persists across navigation, no console/compile errors. | Claude | done |
| F4 | `[HUMAN]` Suhas to actually hold accounts on each provider for verification | Suhas | — |

### Track G — Docs + launch surface

| # | Task | Owner | Est |
|---|---|---|---|
| G1 | README rewrite — punchy, public-facing, screenshots from Aegis | Claude | 2h |
| G2 | docs site (Astro Starlight or similar) covering quickstart, skills, accessibility moat, security model | Claude | 4h |
| G3 | Comparison page vs OpenClaw + generic GPT-4V agents | Claude | 1h |
| G4 | `[HUMAN]` Demo video — Suhas screen-recording a real workflow | Suhas | — |

### v1.0 grand total: ~30–40h agent-time + ~5 hard human blockers.

---

## How Claude and Codex split work

**Claude does** anything in `atrium/src/` (TypeScript, cognition, LLM
router, synapse handlers), tests for that code, docs, audits, and design
review.

**Codex does** anything in `hands/` (Python, accessibility backends,
executor, sensors), `shared/protocol.json` and `hands/protocol.py`
together, installer/signing scripts, and provider auth flow smoke tests.

**Either can do** changelog entries and small cross-cutting cleanups.

**Both should** announce in this file when they start a task (mark
`[wip Claude]` / `[wip Codex]` next to the row) and remove the tag when
done. Don't double-pick tasks. Don't expand scope without updating this
file first.

---

## Honest blocker summary

The thing that won't compress with more agent-hours:

1. A real Mac for B3.
2. A real Linux box for C3.
3. Code-signing certs + Apple Developer account for D5.
4. Telemetry / privacy decision for E4.
5. Real provider accounts for F4.
6. Suhas on camera for G4.

Without those, **v0.2 ships as code but not as a verified release**, and
**v1.0 doesn't ship at all**. Get items 1, 2, 3, and 4 unblocked early.
