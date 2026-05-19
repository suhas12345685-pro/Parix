# Parix v0.2.0-alpha

**First public release.** Atrium + hands code-complete for v0.2; macOS
and Linux accessibility backends pending hardware verification on real
machines.

To create the GitHub release: go to
https://github.com/suhas12345685-pro/Parix/releases/new — pick the
`v0.2.0-alpha` tag from the dropdown, paste the body below, check
"Set as a pre-release" (this is alpha), and publish.

---

## What's in v0.2

### Vision OCR through the LLM router

The old hardcoded Gemini fallback in `hands/accessibility/vision.py` is
gone. Replaced with a router-based path: screenshots go through a
`VISION_OCR_REQUEST` / `VISION_OCR_RESPONSE` synapse round-trip to
atrium, which routes them through whichever multimodal provider the
user chose during onboarding (Anthropic, OpenAI, or OpenRouter today).
Text-only providers are skipped automatically via a new
`supportsImages` capability flag on each adapter. Tesseract is the
fallback when no vision-capable provider is configured, on timeout, or
on router error.

The router never has to wait — atrium *always* sends a
`VISION_OCR_RESPONSE`, with `error` set on `no-router` /
`no-image` / `No LLM provider succeeded` so hands falls back to
tesseract immediately instead of burning the timeout.

### Accessibility moat — three backends, two pending real-hardware verification

- **Windows (`uiautomation`)** — production. Walks the focused window
  via pywinauto, emits `ACCESSIBILITY_SNAPSHOT` on real UI focus
  transitions.
- **macOS (`axapi`)** — code-complete. Implements the full
  `AccessibilityBackend` protocol via pyobjc; gates on
  `AXIsProcessTrusted()`, handles pyobjc's tuple-return AX calls, and
  normalizes `AXValueGetValue` CGPoint/CGSize forms. **Awaiting real-
  Mac verification (B3 in SHIP-PLAN).**
- **Linux (`atspi`)** — code-complete. AT-SPI2 via D-Bus, with
  `get_child_at_index(i)` for the GIR Atspi fallback. **Awaiting real-
  Linux verification with `gsettings ... toolkit-accessibility true`
  (C3 in SHIP-PLAN).**

Permission flows, install commands, and verification one-liners for
both platforms are in
[docs/accessibility-plan.md](../docs/accessibility-plan.md) under
"Platform setup — production verification (v0.2)".

### Privacy-by-default + opt-in telemetry

- Default Parix install runs entirely on your machine. The only
  external calls are to *your* LLM provider and an optional update
  check (six-hourly, anonymous, disable-able).
- Telemetry is **off** in every fresh profile. Hatchery asks once
  during onboarding; the schema validator rejects any profile that
  has `telemetry.enabled = true` without a `consentedAt` timestamp.
- Full policy at [docs/privacy.md](../docs/privacy.md) — it is the
  contract, not the marketing.

### Pre-launch security audit

A pre-launch sweep covering executor, autonomy gates, approval
policy, skill permission boundaries, and the synapse socket landed at
[docs/security-audit-v0.2.md](../docs/security-audit-v0.2.md). Seven
findings catalogued. One HIGH was fixed in this release:

- **HIGH (fixed)** — `payload.approved === true` no longer bypasses
  the approval-required rule chain. The previous behavior let an LLM-
  shaped payload self-approve "delete data," "send external messages,"
  "spend money" actions.

Both audit findings the release notes originally tracked as open are
now closed:

- **Finding 6 (synapse auth)** — fixed 2026-05-19. `hands` refuses
  non-loopback binds without `PARIX_ALLOW_REMOTE_SYNAPSE=1`, and every
  non-loopback peer must complete a `SYNAPSE_AUTH` handshake using a
  shared secret resolved from `PARIX_SYNAPSE_TOKEN` or
  `~/.parix/synapse-token` (auto-generated on first run). See SHIP-PLAN
  row E3b and Finding 6 in the audit doc.
- **Finding 2 (skill permission gate)** — closed as won't-fix by
  design 2026-05-19. Parix's trust boundary lives at the policy/approval
  layer in both Enterprise and personal mode, not at per-skill manifest
  grants; the first-party allowlist stays as the floor for unknown
  skills. Disposition recorded on Finding 2 in the audit doc.

### Auto-update groundwork

`atrium/src/updates/checker.ts` polls a static-JSON update manifest at
startup and every six hours. Never auto-installs. Endpoint contract is
documented at the top of the file. Default endpoint is
`https://updates.parix.dev`; can be pointed at a private mirror for
air-gapped installs.

---

## Verified at this tag

- **atrium:** 114 tests passing, clean typecheck
- **hands:** 93 tests passing
- **Platforms exercised:** Windows
- **Platforms code-complete but not hardware-verified:** macOS, Linux

If you run Parix on a Mac or Linux box and the
`backend_used: "axapi"` / `"atspi"` snapshots come through with real
focused elements, please open an issue — that's exactly the signal
that B3 / C3 can close.

---

## What's next on the path to v1.0

The full plan is in [SHIP-PLAN.md](../SHIP-PLAN.md). Headline rows:

- **E3a** — real skill permission gate (prerequisite for opening
  third-party skills)
- **E3b** — synapse shared-secret handshake
- **D1–D4** — installers + signing pipelines (needs code-signing certs)
- **F1–F2** — per-provider auth flow smoke tests (needs accounts)
- **G1–G4** — README rewrite, docs site, comparison page, demo video

Hard human blockers for v1.0: real Mac, real Linux, Apple Developer
cert, Windows code-signing cert, telemetry backend decision, real
provider accounts, demo recording.
