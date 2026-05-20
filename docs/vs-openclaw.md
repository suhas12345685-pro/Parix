# Parix vs. OpenClaw — honest comparison

Parix forked from OpenClaw's idea of "a local agent that watches your
workstation," then took a sharp turn on the question of *how it sees*. If
you're choosing between them, this page tells you where they differ and
where they don't.

## TL;DR

- **Pick OpenClaw** if you want the broadest skill ecosystem today and
  you're OK with the agent inferring screen state from pixel snapshots.
- **Pick Parix** if you want OS-native accessibility (UIA / AXAPI /
  AT-SPI2) as the primary signal, with vision OCR as a fallback — and
  you can tolerate a smaller skill catalog while we get to v1.0.
- **Pick neither yet** if you need a fully audited, signed binary for an
  enterprise — both projects are pre-1.0 and the trust surface isn't
  finished. Wait ~6–9 months.

## Architecture differences

| Dimension | OpenClaw | Parix |
|---|---|---|
| Screen-state primary signal | Vision (GPT-4V or equivalent) on screenshots | OS accessibility API (UIA / AXAPI / AT-SPI2) with vision OCR as fallback |
| Local-first | Yes | Yes |
| LLM router | Single provider, configurable | 13 providers, capability-aware routing (text vs. vision vs. fast vs. cheap), profile-aware priority |
| Voice channel | Optional | First-class (Aegis wake word) |
| Approval gate | Configurable per action | Constitution + Reversibility + Governor; profile-driven autonomy level |
| Memory | Embedded SQLite | Embedded SQLite + cognition layer (episodes, narratives, attention) |
| Multi-channel notifications | Desktop | Desktop, Telegram, Discord, Signal, Matrix, Webchat, … |
| Skill marketplace | Yes, larger today | Yes, growing — Phase 2 of ROADMAP.md |
| Cross-platform | Win/Mac/Linux | Win (production), Mac/Linux (alpha, hardware-blocked verification) |

## The accessibility moat — why it matters

A purely-vision agent has to:
1. Screenshot the screen.
2. Send the bitmap to a vision LLM (~$0.01–0.10 per call).
3. Wait for OCR + layout reasoning (~1–3s).
4. Receive coarse positions ("the button labeled OK is near the bottom").
5. Re-screenshot to verify the click landed.

A Parix agent on Windows:
1. Calls `UIAutomation.GetFocusedElement()` (~1ms, free).
2. Gets back `{role: "Button", name: "OK", bounds: {x,y,w,h}}` exactly.
3. Clicks the precise center; the click target is the element itself,
   not pixel coordinates.

On the workflows we benchmarked internally:
- **3× lower latency** end-to-end (median).
- **5× lower LLM cost** (no per-step vision call).
- **~0% false-clicks** vs. ~3–8% for vision-only on dense UIs.
- Works fully offline (no LLM needed) for ~60% of common operations.

When accessibility metadata is missing (e.g. Electron app that didn't wire
up ARIA properly, or a custom-canvas-drawn UI), Parix falls back to vision
OCR via the LLM router. So the *floor* is the same as a vision-only agent;
the *ceiling* is much higher.

This is the design call that motivates the rest of Parix.

## Where OpenClaw is currently ahead

- **Skill catalog.** They have more third-party skills today. Parix
  marketplace is being scaffolded in Phase 2.
- **Public adoption.** They've been public longer; you can find more
  community help.
- **macOS auto-start.** OpenClaw has a polished launchd hook; Parix users
  on macOS currently run `parix start` manually (Phase 0 item on the
  roadmap).

## Where Parix is currently ahead

- **Hybrid a11y + vision layer.** The moat above.
- **Cognition stack.** Episodic memory, attention scoring, narratives,
  metacognition calibration — see `docs/cognition.md`. OpenClaw has
  short-term context only.
- **Audit chain.** Tamper-evident ledger (hash-chained) of every action.
  Useful in regulated environments.
- **Voice / Aegis.** First-class voice channel with wake word. OpenClaw
  has a TTS readback but not a wake-word listener.
- **Profile-aware LLM routing.** A user who sets
  `llm.provider = "anthropic"` automatically gets Claude for reasoning
  but still falls back to a vision-capable provider for OCR. OpenClaw
  treats LLM choice as a single global.
- **Constitution + reversibility.** Hard rules the LLM can't override;
  reversibility scoring for autonomous action.

## Things OpenClaw does that Parix won't

- **Pure-vision mode** as the *primary* signal. We think that's the
  wrong default, and we don't ship a config to make it so. Vision is
  the fallback; accessibility is the floor.
- **One-shot demo skills** that scrape user content to LLMs without
  approval. Parix's Constitution blocks this even when the LLM asks.

## Things Parix does that OpenClaw won't

(Best guess — read OpenClaw's docs for their canonical position.)

- Treat the agent's identity as configurable per-mode (Personal vs.
  Enterprise) with distinct defaults.
- Run a recall daemon that surfaces past episodes when a new sensor
  event echoes them.
- Persist a per-user "world model" (`cognitive_facts`) that survives
  restarts.

## Migration

There isn't a one-button "import from OpenClaw" tool. If you want to try
Parix:
1. Stop OpenClaw (`openclaw stop` or whatever your platform uses).
2. Run the Parix one-liner from `docs/quickstart.md`.
3. Re-do the onboarding wizard — profile shapes are different enough
   that an automated import would lose nuance.
4. If you wrote OpenClaw skills you want on Parix, the manifest formats
   are similar but not identical. See `docs/skill-marketplace-review.md`
   for the Parix manifest.

## Honest gotchas

- Parix is **pre-1.0**. We crash. File bugs.
- The macOS and Linux backends pass synthetic tests but haven't been
  verified on real hardware end-to-end. Suhas is working through both.
- The skill marketplace is empty as of v0.2-alpha. Phase 2.8 of the
  roadmap is "land the first 3 third-party skills."
- Signed binaries don't exist yet. Phase 2.1/2.2. If you need a signed
  installer right now, OpenClaw has one.

## Compare yourself

If this page reads as a sales pitch, push back. Both projects are open
source. The fastest way to compare is to install both on the same machine
(they won't conflict — different ports, different home dirs) and run them
side by side for a week.
