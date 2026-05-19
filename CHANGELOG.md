# Changelog

All notable changes to Parix are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/).

## [Unreleased] — v0.2 in progress

### Added — vision OCR via the LLM router (replaces the removed Gemini hardcode)

The deferred work from v0.1.7 is landing in pieces. Atrium-side router and
adapter plumbing is in; protocol + hands wiring is still in flight (Codex).

- **`LLMRequest.images`** (`atrium/src/llm/types.ts`): optional
  `LLMImage[]` of `{mimeType, base64}` pairs. Adapters that handle images
  set `supportsImages = true` on the provider; the router filters chains
  by that capability when an image-bearing request comes in.
- **`vision` route in `createDefaultLLMRoutes`**
  (`atrium/src/llm/router.ts`): prefers `anthropic` → `chatgpt` →
  `openrouter`. The router skips any provider whose `supportsImages` is
  not `true` once images are present, and falls through to the next.
  Empty chain throws "No LLM provider succeeded for vision" — hands is
  expected to catch that and tesseract-fall-back.
- **Anthropic adapter** (`atrium/src/llm/adapters/anthropic.ts`): emits
  `{type:"image", source:{type:"base64", media_type, data}}` content
  blocks alongside the text prompt when images are present.
- **OpenAI / OpenRouter adapters** (`atrium/src/llm/adapters/openai.ts`):
  emit `{type:"image_url", image_url:{url:"data:<mime>;base64,..."}}`
  parts. OpenRouter inherits multimodal capability for free.
- **`VISION_OCR_REQUEST` / `VISION_OCR_RESPONSE` synapse messages**
  (`shared/protocol.json`, `hands/protocol.py`,
  `hands/accessibility/vision.py`): hands packs the screenshot + prompt
  and awaits a text reply with a configurable timeout, falling back to
  tesseract on `error` or timeout.
- **Atrium synapse vision handler**
  (`atrium/src/synapse/vision-handler.ts`,
  `atrium/src/synapse/client.ts`): receives `VISION_OCR_REQUEST`, runs
  it through the `vision` route, returns the LLM's text. Always replies
  — even on `no-router`, `no-image`, or `No LLM provider succeeded` —
  so hands never has to wait out a timeout to fall back to tesseract.
- **macOS + Linux platform setup docs**
  (`docs/accessibility-plan.md`): permission grants, install commands,
  and verification one-liners for `axapi` and `atspi` backends.

### Security

- **Removed self-approval bypass** in `applyProfileApprovalRules`
  (`atrium/src/config/profile.ts`). The previous code treated
  `payload.approved === true` (or `payload.humanApproved === true`) as
  a signal that approval-required actions could proceed. Because the
  payload is shaped by LLM output, a model that proposed an action
  could also propose its own approval — bypassing the entire approval-
  required rule chain. The check is removed; approval state will be
  re-introduced as a runtime context parameter (not a payload field)
  when Aegis approval UX lands.
- **Pre-launch security audit** published at
  `docs/security-audit-v0.2.md` covering executor, autonomy gates,
  approval policy, skill permission boundaries, and the synapse
  socket. Seven findings catalogued with severity, file/line refs, and
  recommended fixes. All HIGH findings now closed (Finding 1 fixed in
  the audit; Finding 2 closed as won't-fix by design on 2026-05-19;
  Finding 6 fixed below).
- **Synapse auth (Finding 6)**: `hands` refuses to bind
  `PARIX_WS_HOST` to a non-loopback address unless
  `PARIX_ALLOW_REMOTE_SYNAPSE=1` is also set. Any non-loopback peer
  must complete a `SYNAPSE_AUTH` handshake within 5 seconds using a
  shared secret resolved from `PARIX_SYNAPSE_TOKEN` env var or
  `~/.parix/synapse-token` (auto-generated on first run). Loopback
  peers (desktop install) keep working with zero configuration.
  Containerized deploys must supply `PARIX_SYNAPSE_TOKEN` externally —
  Dockerfiles bake `PARIX_ALLOW_REMOTE_SYNAPSE=1` but never a token.
  Token comparison uses `secrets.compare_digest`; mismatch returns
  `SYNAPSE_AUTH_ERROR` and closes with WS code 4401.
- **Skill permission gate (Finding 2)** closed as won't-fix by design.
  Parix's trust boundary lives at the policy/approval layer in both
  Enterprise and personal mode; the first-party allowlist in
  `atrium/src/skills/skill-permissions.ts` stays as the floor for
  unknown skills (empty grant set).

### Added — v1.0 groundwork (pre-launch, not yet user-facing)

- **Auto-update poll client** (`atrium/src/updates/checker.ts`): polls
  a static-JSON update manifest at startup and every 6h, never auto-
  installs, emits `update_available` when a newer release is published.
  Endpoint contract is documented inline. `ParixProfile.updates`
  carries `{ channel, endpoint, pollIntervalMs, lastCheckedAt,
  autoCheck }`; default endpoint is `https://updates.parix.dev` and
  can be pointed at a local mirror for air-gapped installs.
- **Telemetry opt-in** (`ParixProfile.telemetry`, hatchery TUI,
  `docs/privacy.md`): a single confirm prompt during onboarding,
  default **no**, explicit list of what is and isn't sent. The
  schema validator refuses any profile that has `telemetry.enabled =
  true` without a `consentedAt` timestamp. The privacy doc is the
  contract — if the code disagrees with it, that's a bug.

### Still to land in v0.2

- macOS + Linux backend polish on real hardware (B2/C2 —
  `AXValueGetValue` unwrap and `get_child_at_index` swap, both audited
  and scoped in `docs/accessibility-plan.md`).
- `[HUMAN]` Real-Mac + real-Linux verification (B3 / C3).

## [0.1.7-alpha] — 2026-05-18

### Removed

- **Hardcoded Gemini OCR fallback** in `hands/accessibility/vision.py`. The
  vision backend used to escalate to `gemini-1.5-flash` over HTTPS when
  local tesseract was missing or returned empty text, regardless of which
  LLM provider the user picked during onboarding. That bypassed the LLM
  router and pinned a single vendor for what is supposed to be a
  user-chosen capability. Removed `_gemini_ocr`, the
  `GEMINI_API_KEY` / `GEMINI_OCR_MODEL` / `PARIX_VISION_GEMINI_MODEL`
  env vars, and the corresponding `hands/tests/test_vision_gemini.py`.
  Behavior is now: tesseract result, or empty text when tesseract is
  unavailable.

### Deferred to v0.2

Multimodal-LLM OCR replacement — see the "Unreleased" v0.2 entry above for
the in-flight implementation.

## [0.1.6-alpha] — 2026-05-17

### Added — accessibility moat is live

This release flips the accessibility layer from "code exists" to "producing
signal end-to-end." The bridge, four backends, and fusion already shipped in
v0.1.x; what landed today is the plumbing that makes them affect agent
behavior.

- **Hands**: new `hands/sensors/a11y_poller.py`. A debounced async loop that
  calls `AccessibilityBridge.snapshot()`, computes a stable
  `fingerprint()` on the focused-element state, and emits an
  `ACCESSIBILITY_SNAPSHOT` message over the synapse socket only when the
  fingerprint changes (i.e. on real UI focus transitions). Wired into
  `hands/main.py` startup; configurable via `PARIX_A11Y_INTERVAL_S`,
  `PARIX_A11Y_MODE`, `PARIX_A11Y_DISABLED`.
- **Types**: `AccessibilitySnapshot.summarize()` produces a wire-safe
  compact form (focused element + 2 levels of context, never the full tree).
  `UIElement.summarize()` truncates names/values to 120 chars.
- **Atrium**: new `atrium/src/synapse/a11y-handler.ts` ingests the message,
  stores rows in the new `accessibility_snapshots` table, and exposes
  `getLatestAccessibility()` for in-process consumers.
- **Cognition**: `WorkingMemory` grows a `focusedElement` field, populated
  on every cycle from the latest snapshot. `inferGoal()` falls back to the
  focused-element role when no event-type heuristic fires.
  `inferDesire()` raises the interrupt floor to 0.85 / urgency 0.6 when the
  user is typing, and to 0.9 when a modal dialog is in focus.
  `generateHypotheses()` boosts confidence on hypotheses whose explanation
  tokens overlap with the focused UI element (Jaccard similarity → up to
  +0.15 credibility bump).
- **Aegis**: new `AccessibilityFocus` component shows focused app, focused
  element role+name+state, backend used, and snapshot confidence. Lives in
  the dashboard alongside `AttentionFocus` and `CognitiveLoad`.
- **Schema**: new `accessibility_snapshots` table with an index on `ts DESC`.
- **Tests**: 4 new TS tests in
  [atrium/src/__tests__/e2e-accessibility-cognition.test.ts](atrium/src/__tests__/e2e-accessibility-cognition.test.ts)
  prove the round-trip (snapshot persisted → working memory updates →
  interrupt softens under typing focus). 5 new Python tests in
  `hands/tests/test_a11y_poller.py` cover fingerprint stability, debounce,
  and the start/stop contract.

### Fixed

- **`hands/platform.py` shadowed the stdlib `platform` module.** This had
  been breaking any third-party library doing `import platform` — pytest
  itself couldn't load on this codebase. Renamed to `hands/platforms.py`
  (plural); updated the two callers (`hands/hatchery.py`, the test file).
  Python tests now run.

### Changed

- `WorkingMemory.focusedElement` is now a required field on the
  `WorkingMemory` type. Three test fixtures
  (`attention.test.ts`, `cognition.test.ts`, `metacognition.test.ts`)
  updated to set `focusedElement: null` for their synthetic memories.
- Aegis health snapshot envelope grows a `cognition.accessibility` field;
  `aegis/src/types.ts` `CognitionSnapshot` updated accordingly.

### Added — Phase 4 hardening

The three items I'd initially deferred all landed in the same pass:

- **Gemini Vision fallback** (`hands/accessibility/vision.py`). When local
  tesseract OCR returns fewer than 8 non-whitespace characters AND
  `GEMINI_API_KEY` is set, the backend posts the screenshot to
  `gemini-1.5-flash` (model is overridable via `PARIX_VISION_GEMINI_MODEL`)
  and uses its extracted text. Hits the REST endpoint directly via
  `urllib.request` — no new pip dep. Network errors, malformed responses,
  and missing keys all degrade silently to the local OCR result. 4 new
  tests in `hands/tests/test_vision_gemini.py` cover all four paths.
- **Cross-platform CI matrix** (`.github/workflows/ci.yml`). The
  `build-test` job now runs on `ubuntu-latest`, `macos-latest`, and
  `windows-latest` in parallel. Each runner also executes the Python
  accessibility/poller test suites — proving the dispatch path on all
  three OSes, even though native backends (pywinauto / pyobjc / pyatspi)
  aren't installed in CI.
- **`accessibility:read` skill permission**
  (`shared/types/skill.ts`, `shared/skill-manifest.schema.json`). New
  entry in the `SkillPermission` enum. Council augments a skill's inputs
  with `_accessibility: { focusedApp, backendUsed, confidence,
  focusedElement }` *only* when the manifest declares the permission;
  skills without it never see UI focus data. `runSkill` rejects with
  `SkillPermissionError` if a caller tries to dispatch a manifest whose
  permissions exceed the clearance set. 3 new tests in
  `atrium/src/__tests__/e2e-accessibility-permission.test.ts`.

No follow-up items remain from the original Phase 4 backlog.

## [0.1.5-alpha] — 2026-05-17

### Added

- **Council now dispatches to skill manifests.** When a sensor event matches a
  registered skill via `matchSkills()`, the council rewrites the action plan
  to `taskType: "skill"` and routes it through the new local `runSkill`
  runner (subprocess + JSON output parsing + timeout) instead of the Synapse
  WebSocket. This closes the manifest-loader → runner loop end-to-end: a
  fresh install can act on `disk_space_low` (or any declared event) without
  any learned cache.
- **New E2E test** in
  [atrium/src/__tests__/e2e-council-skill.test.ts](atrium/src/__tests__/e2e-council-skill.test.ts):
  drives a sensor event into a real `AtriumEngine` (with a stub Synapse) and
  asserts the rewritten `taskType: "skill"` plan executes and emits a JSON
  output. Two tests, both passing.
- **Accessibility moat activation plan** in
  [docs/accessibility-plan.md](docs/accessibility-plan.md). Audits what's
  built (~533 LOC bridge + 4 backends + fusion + vision) vs what's missing
  (sensor producer, atrium consumer, dashboard surface). Phased plan with
  per-task owners and acceptance criteria for "moat is real."

### Changed

- Constitution and reversibility checks now run twice on a rewritten skill
  plan: once on the original `cli`/`notification` plan and once on the
  rewritten `skill` plan. This is intentional — destructive skills can still
  be blocked even if the manifest declares high reversibility.

### Removed

- Unused helpers `skillDirFor` and `skillsRootFromAtriumIndex` from
  `atrium/src/intelligence/skill-runner.ts` (speculative exports with zero
  callers).

## [0.1.4-alpha] — 2026-05-17

### Added

- **Skill manifest registry.** New `atrium/src/intelligence/skill-registry.ts`
  scans `skills/task-*/config.json` at boot, validates each manifest, and
  indexes triggers by event type. `matchSkills(event)` returns every
  registered skill whose trigger matches on `eventType`, `minConfidence`,
  `platforms`, required `dataKeys`, and `keywords`.
- **Skill runner.** New `atrium/src/intelligence/skill-runner.ts` spawns a
  manifest's `entry` under the configured runtime (`py` | `node` | `sh`),
  feeds inputs as JSON on stdin, enforces `timeoutMs`, and returns a
  normalized `SkillResult` (success / exit code / duration / parsed output /
  error). Throws `SkillPermissionError` if the caller's permission clearance
  doesn't cover the manifest's declared `permissions`.
- **Manifest schema** (`shared/skill-manifest.schema.json`) and TypeScript
  type (`shared/types/skill.ts`). `scripts/validate-skill-manifests.ts`
  validates all 11 existing `task-*` skills.
- **Boot wiring.** `atrium/src/index.ts` now calls `loadSkills(SKILLS_DIR)`
  after database init and logs the count of registered skills + triggers.
- **E2E execution trace tests** in
  `atrium/src/__tests__/e2e-skill-execution.test.ts`: load → match → run →
  observe `cognition.hasCache` flip on a real cognitive cycle (6 tests).
- Docs: skill registry + runner section in [docs/cognition.md](docs/cognition.md)
  with a tuning guide.

### Changed

- **`cognition.hasCache` now considers both sources.** Metacognition's
  `reflex` and `delegate` strategies fire when either the learned skill cache
  (`lookupSkill`) or the manifest registry (`matchSkills`) matches the
  current event. Fresh installs can take confident action via declared
  skills before any learning has happened.
- Vitest is now driven by explicit configs at both the atrium workspace
  level ([atrium/vitest.config.ts](atrium/vitest.config.ts)) and the repo
  root ([vitest.config.ts](vitest.config.ts)). `qa/**` is excluded so its
  `node:test` files don't pollute vitest runs.

### Removed

- Dead re-export `atrium/src/intelligence/skill-cache.ts`. Use
  `skillcache.ts` directly.

### Migration

- **No schema changes.** Skill manifests are read-only files on disk; nothing
  to migrate.
- **Boot startup logs change.** A new `[BOOT] Loaded N skill manifest(s)…`
  line appears after database init. Anyone parsing boot logs should expect
  it.
- **`hasCache` semantics broaden.** If you relied on `lookupSkill()` being
  the only source feeding metacognition's `reflex`/`delegate` paths, expect
  these strategies to fire earlier now whenever a matching manifest exists.

## [0.1.3-alpha] — 2026-05-17

### Added

Four new cognitive systems land on top of the existing event → desire →
hypothesis → action pipeline:

- **Hierarchical planner** (`atrium/src/cognition/planner/`). `decompose()`
  breaks a desire into a `GoalTree` of `PlanNode`s with `dependsOn` edges:
  silent prep → investigation → action. `nextExecutable()` exposes the
  parallelism layer. `repairStrategy()` reacts to failures with
  `retry` / `skip` / `replan_subtree` / `escalate` instead of restarting
  from scratch. Trees survive restarts via the new `plan_trees` table.

- **Attention gate** (`atrium/src/cognition/attention.ts`). Every event
  passes through `gate(event, workingMemory)` before reaching cognition.
  Breakthroughs always admit, suppressed types always drop, otherwise
  the decision is driven by focus relevance, novelty, and a
  focus-strength-aware threshold. Focus strengthens on relevant
  admissions and decays over time. Verdicts are logged to `attention_log`.

- **Metacognition + Brier calibration**
  (`atrium/src/cognition/metacognition.ts`). `assess()` picks a strategy
  per cycle — `reflex`, `deliberate`, `ask_user`, `defer`, or
  `delegate` — given top-hypothesis confidence, cognitive load, skill
  cache hits, reversibility, and recent calibration. Each cycle records
  `(predictedConfidence, actualOutcome)` into `calibration_records`; a
  rolling Brier score raises the bar for autonomous action when the
  agent has been wrong recently and restores it when predictions come
  back in line.

- **Horizon / multi-session narratives** (`atrium/src/cognition/horizon.ts`).
  Goals the agent is pursuing across cycles are tracked as `Narrative`s
  with attempts and lessons. After three consecutive failures a
  narrative is marked `blocked`. `checkCoherence(action)` runs before
  execution and surfaces conflicts ("this undoes a goal"), reinforcements
  ("this advances a goal"), and anti-repetition warnings ("we tried this
  approach before and it failed"). Narratives persist in the new
  `narratives` table.

Supporting changes:

- New `CognitiveSnapshot` fields: `attention`, `attentionState`,
  `metacognition`, `activePlan`.
- Aegis relay forwards the new snapshot fields so dashboards can render
  plan progress, attention focus, cognitive load, and active narratives.
- Documentation: [docs/cognition.md](docs/cognition.md) explains the
  upgraded loop, every module's thresholds, and a tuning guide for the
  most common failure modes.
- E2E tests: `atrium/src/__tests__/e2e-cognition.test.ts` exercises the
  full pipeline (attention admit/reject, planner repair, narrative
  blocking, first-run boot).

### Changed

- **`runCognition(event)` now returns `CognitiveSnapshot | null`.** A
  `null` return means the attention gate rejected the event before any
  downstream work happened — working memory, world facts, preferences,
  and persistence are all unchanged for that event. Callers must handle
  the `null` case; `council.ts` already does.
- Cognitive load (`computeLoad`) now considers active goal trees and
  pending nodes in addition to working-memory blockers and uncertainty.
- `desire.confidence > 0.7` now sets attention focus to the inferred
  goal, so subsequent related events are admitted more eagerly.

### Fixed

- Boot-time loaders (`loadNarratives`, `loadActivePlanTrees`) now return
  empty arrays instead of throwing when their tables don't exist yet
  (first run, isolated tests).
- Cold-start novelty: when `recentSignals` is empty, novelty is 1.0 so
  the very first event is never gated out as "stale".
- `decomposeComplex` correctly falls back to `decomposeSingle` when a
  desire has neither `silentPrep` nor `suggestedHelp` *and* no
  hypotheses with missing evidence.

### Migration

- **Schema.** New tables auto-create on next boot from
  `shared/schema.sql`: `plan_trees`, `narratives`, `calibration_records`,
  `attention_log`. No manual migration step is required — `initDb()`
  runs the schema on every startup with `IF NOT EXISTS` guards.
- **API.** Any code outside the council that called `runCognition()`
  and treated the result as always-defined must now handle `null` (see
  the example in `council.ts:149` and `:170`).
- **No data migration required.** Existing memory.db files keep working;
  the new tables start empty and populate as the agent runs.
