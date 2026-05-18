# Accessibility Moat — Activation Plan

The moat (`hands/accessibility/`) is **built but not producing signal**. Bridge,
four backends (Windows/macOS/Linux/Vision), fusion, and types are all coded —
~533 LOC, defensive against missing platform libraries. What's missing is the
wiring that turns it into a live information source the rest of Parix
actually consumes.

This document is a **plan, not an implementation**. Approve / edit / argue
before any code lands.

## What exists today

| Component | Status | Notes |
|---|---|---|
| `hands/accessibility/types.py` | ✅ Built | `UIElement`, `AccessibilitySnapshot` dataclasses |
| `hands/accessibility/__init__.py` | ✅ Built | `AccessibilityBridge` — platform dispatch, vision fallback, fusion routing |
| `hands/accessibility/windows.py` | ✅ Built | pywinauto/UIAutomation — guarded import |
| `hands/accessibility/macos.py` | ✅ Built | pyobjc AXUIElement |
| `hands/accessibility/linux.py` | ✅ Built | pyatspi via D-Bus |
| `hands/accessibility/vision.py` | ✅ Built | mss screenshot + `tesseract` subprocess OCR |
| `hands/accessibility/fusion.py` | ✅ Built | Merge native tree + vision-only children |
| `hands/tests/test_accessibility.py` | ✅ Built | Cannot run locally — see "Test env" below |
| `hands/vision/agent.py` | ✅ Uses bridge | But only during explicit vision-agent runs, not as a continuous signal |
| Protocol `ACCESSIBILITY_SNAPSHOT` | ⚠️ Defined, no producer | `shared/protocol.json:29`, listed in `hands/main.py:66`, but no code sends it |
| Sensor poller → bridge | ❌ Missing | `hands/sensors/watcher.py` does not import `AccessibilityBridge` |
| Atrium consumes snapshots | ❌ Missing | No reader in `atrium/src/` for `ACCESSIBILITY_SNAPSHOT` |
| Context fusion uses UI trees | ❌ Missing | `signals.active_window` is still a string |
| Aegis dashboard surface | ❌ Missing | No component shows focused UI element / a11y backend used |
| Vision: Gemini fallback | ❌ Missing | `vision.py` is tesseract-only; spec calls for Gemini when OCR confidence is low |

## What "moat is real" means (acceptance criteria)

The moat is real when, **without code changes from a user**, this is true:

1. A live Parix session emits `ACCESSIBILITY_SNAPSHOT` messages at the same
   cadence as other sensor signals (say 1–5 Hz, throttled).
2. The snapshot includes `{ backend_used, focused_app, focused_element_summary,
   confidence }` — and on Windows in practice that means
   `backend_used: "uiautomation"` (or `"fused"` when vision is on).
3. The cognitive pipeline references *which UI element is focused*, not just
   the window title, in `WorkingMemory` and `DesireInference.evidence`.
4. At least one silent intent or skill trigger uses an a11y-derived field
   (e.g. `focused_element.role === "text_field"` instead of pattern-matching
   on window titles).
5. The Aegis dashboard shows the current focused element + backend in real
   time — visible proof that the moat is on.

If those five hold, the OpenClaw comparison table in `accessibility-layer.md`
is no longer aspirational.

## Phasing

### Phase 1 — Make the moat produce signal (1–2 days)

Goal: an `ACCESSIBILITY_SNAPSHOT` message reaches atrium.

| Task | Owner | File(s) |
|---|---|---|
| Add `AccessibilityPoller` in hands that runs `AccessibilityBridge.snapshot()` on an interval, debounces by focused-app change | Claude | new: `hands/sensors/a11y_poller.py` |
| Wire poller into `hands/main.py` startup; send `ACCESSIBILITY_SNAPSHOT` over the synapse socket | Codex | `hands/main.py` |
| Snapshot summarization: full tree is too large — produce a `tree_summary` (focused element + 2 levels of context) per protocol spec | Claude | `hands/accessibility/__init__.py` (add `.summarize()` method) |
| Atrium handler for `ACCESSIBILITY_SNAPSHOT` — log it, store in `working_memory`, expose via `getLatestA11ySnapshot()` | Claude | new: `atrium/src/synapse/a11y-handler.ts`; touch: `atrium/src/synapse/client.ts` |
| Schema: new `accessibility_snapshots` table (snapshot_id, ts, backend_used, focused_app, focused_element_summary_json, confidence) | Codex | `shared/schema.sql` |

**Exit criterion:** open the agent, focus a different app, and see new rows
appear in `accessibility_snapshots`. No cognition changes yet.

### Phase 2 — Use the signal in cognition (2–3 days)

Goal: working memory and desire inference both consume a11y context.

| Task | Owner | File(s) |
|---|---|---|
| Extend `WorkingMemory` with `focusedElement?: { role, name, value, state[] }` | Claude | `atrium/src/cognition/types.ts`, `working-memory.ts` |
| Plumb the snapshot through `runCognition` so `inferDesire` sees `focusedElement` (not just `data.active_app`) | Claude | `atrium/src/cognition/index.ts`, `desire.ts` |
| Update `hypotheses.ts` to weight evidence from focused element type (e.g. text_field → typing-context hypotheses) | Claude | `atrium/src/cognition/hypotheses.ts` |
| Upgrade `inferGoal()` to use `focusedElement.role` ahead of event-type heuristics | Claude | `atrium/src/cognition/working-memory.ts` |
| Add at least 1 silent-intent detector that requires a11y signal (e.g. `detect_form_abandonment`: text fields filled then focus left without submit) | Codex | `hands/sensors/silent_intent.py` |

**Exit criterion:** on a fresh session, the agent's first cognitive snapshot
after focusing a text editor shows `workingMemory.focusedElement.role ==="text_field"`
and a desire whose `evidence[]` cites it.

### Phase 3 — Make it visible + tunable (1–2 days)

Goal: the moat is observable to anyone using the agent.

| Task | Owner | File(s) |
|---|---|---|
| Aegis component `AccessibilityFocus` — focused app, focused element, backend used, confidence | Codex | new: `aegis/src/components/AccessibilityFocus.tsx` |
| Relay `buildHealthSnapshot` adds `accessibility: { focusedApp, focusedElementRole, backendUsed, confidence }` | Claude | `atrium/src/aegis/relay.ts` |
| Settings: `accessibility.pollIntervalMs`, `accessibility.mode` (`auto`/`vision`/`accessibility`/`off`) | Codex | `shared/hatchery-schema.ts`, `atrium/src/config/profile.ts` |
| docs/cognition.md — add a "What the agent can see" section showing the a11y pipeline | Claude | `docs/cognition.md` |

**Exit criterion:** the dashboard shows a live "Focused element: <role>" line
that updates when you click into a different app.

### Phase 4 — Hardening (post-demo, optional but high-leverage)

| Task | Owner |
|---|---|
| Gemini Vision adapter in `vision.py` as a fallback when local OCR confidence < 0.5 | Codex |
| Snapshot caching + diffing: only emit when the focused element or tree summary changes | Claude |
| Cross-platform smoke tests on a Linux + macOS runner in CI | Codex |
| Permission model: `AccessibilitySnapshot` contains data — should be gated by an `accessibility:read` permission in the manifest schema | Claude |

## Risks and decisions to make first

| Risk | Resolution before starting |
|---|---|
| Snapshot rate too high — UIAutomation walks every monitor poll cycle and can spike CPU. | Phase 1 must include debouncing on focused-window change + a minimum interval (e.g. 200ms). |
| The full tree blows up message size. | Always send `tree_summary` (focused + 2 levels), never the full tree, over the wire. Full tree is opt-in via request/response. |
| `hands/platform.py` shadows the stdlib `platform` module — confirmed today when running pytest. | Rename `hands/platform.py` to something else (e.g. `hands/platforms.py`) BEFORE Phase 1; otherwise no Python test in `hands/` can run. **This is a 5-minute fix that's blocking everything.** |
| User privacy — UI trees can leak passwords, document text, secret tokens. | Phase 1 stores `tree_summary` only; full trees never go to disk. Phase 4 adds the permission gate. |
| Vision OCR via tesseract subprocess is brittle (PATH, missing binary). | `vision.py` already returns empty on missing tesseract — Phase 4 Gemini adapter is the durable fix. |

## Test env caveat (call out before Phase 1)

`hands/tests/test_accessibility.py` exists but can't run because of the
`hands/platform.py` shadowing issue. Fixing that is the first commit of
Phase 1 — without it we can't verify Phase 1's wiring.

## Total estimate

- **Phase 1**: 1–2 days, lights up the signal.
- **Phase 2**: 2–3 days, makes the agent smarter.
- **Phase 3**: 1–2 days, makes the moat visible.
- **Phase 4**: optional, 2–4 days, makes it production-grade.

Phases 1–3 together (~5 days) are what turns the comparison table in
`accessibility-layer.md` from aspirational into an actual claim.

---

## Platform setup — production verification (v0.2)

Both non-Windows backends are structurally complete (`get_tree()` implemented,
no stubs) but require an OS-level permission grant before they produce
useful trees. This section is the user-facing instructions that ship with
v0.2 once B3/C3 hardware verification passes.

### macOS

`MacOSBackend` uses pyobjc's `ApplicationServices.AXUIElement*` APIs. Without
the Accessibility permission, every `AXUIElementCopyAttributeValue` call
silently returns `None` and the snapshot looks like an empty tree —
**there is no error**, the agent just sees nothing.

**One-time permission grant:**

1. Open **System Settings → Privacy & Security → Accessibility**.
2. Click the **+** button, navigate to `/Applications/Parix.app` (or the
   terminal you launched Parix from, for dev builds), add it.
3. Toggle the entry **on**. macOS will prompt to quit and relaunch the app
   — confirm. The permission does not take effect on the running process.

**Verifying it worked:** with Parix running, focus Safari and run

```bash
tail -n 5 ~/.parix/logs/hands.log | grep ACCESSIBILITY_SNAPSHOT
```

You should see `"backend_used": "axapi"` (not `"none"`, not `"vision"`)
and a non-empty `focused_element` block. If `backend_used` is `"none"`,
permission was not granted to the right binary — most common cause is
adding the Terminal but launching Parix from a different shell or vice
versa.

**Known issues on real hardware (B2 — track in `hands/accessibility/macos.py`):**

- `AXPosition` and `AXSize` come back as opaque `AXValueRef`s, not objects
  with `.x` / `.width`. The backend currently does `int(position.x)` which
  will raise on first focus event. Fix: `AXValueGetValue(ref,
  kAXValueCGPointType, byref(point))` then read the struct fields.
- Some pyobjc versions return `(error_code, value)` tuples from
  `AXUIElementCopyAttributeValue`; others return the raw value. `_copy_attr`
  needs to handle both shapes.
- Add an `AXIsProcessTrusted()` check at backend init and log a clear
  "macOS Accessibility permission not granted" message — otherwise the
  empty-tree-on-no-permission failure mode is invisible.

### Linux

`LinuxBackend` uses AT-SPI2 over D-Bus, either via the legacy `pyatspi`
module or the GIR-bound `gi.repository.Atspi`. AT-SPI2 is **off by default**
on many distros; the backend will import fine and then `getDesktop(0)`
returns a desktop with zero children.

**One-time enable:**

```bash
# GNOME / GTK apps:
gsettings set org.gnome.desktop.interface toolkit-accessibility true

# KDE / Qt apps — set this in the session env:
export QT_ACCESSIBILITY=1
export QT_LINUX_ACCESSIBILITY_ALWAYS_ON=1
```

The `gsettings` change is persistent. The Qt vars need to be in the shell
that launches the app you want Parix to observe — easiest is to put them
in `~/.profile` or the desktop entry's `Exec=`.

**Dependencies:**

```bash
# Debian / Ubuntu
sudo apt install python3-pyatspi gir1.2-atspi-2.0 at-spi2-core

# Fedora
sudo dnf install python3-pyatspi at-spi2-core
```

`at-spi2-core` provides the `at-spi-bus-launcher` D-Bus service. If it's
not running you'll see `pyatspi.Registry.getDesktop` either raise or
return a desktop with zero children.

**Verifying it worked:** with Parix running, focus a GTK app like Files
or Firefox, then

```bash
tail -n 5 ~/.parix/logs/hands.log | grep ACCESSIBILITY_SNAPSHOT
```

Expect `"backend_used": "atspi"` and a non-empty `focused_element`. If
the tree is empty but the import succeeded, AT-SPI2 is off — re-check
the `gsettings`/`QT_ACCESSIBILITY` step above.

**Known issues on real hardware (C2 — track in `hands/accessibility/linux.py`):**

- `_walk` indexes children with `element[i]`. That works on the legacy
  `pyatspi` module but not on raw `gi.repository.Atspi.Accessible` —
  swap to `element.get_child_at_index(i)` for the Atspi-fallback code
  path. This is the only known divergence between the two imports.

### Windows

Already production. `WindowsBackend` uses pywinauto/UIAutomation and
emits `backend_used: "uiautomation"`. No permission step required.
