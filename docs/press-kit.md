# Parix — press kit

Last updated: 2026-05-20. Contact: Suhas (email in invitation thread, or
the one in the GitHub org profile once the repo is public).

## One-paragraph pitch

Parix is a local-first autonomous agent that watches your workstation
and quietly fixes problems before they get in your way. Unlike vision-
only desktop agents, Parix reads your screen through the operating
system's own accessibility tree — UIAutomation on Windows, AXAPI on
macOS, AT-SPI2 on Linux — which makes it 3× faster, 5× cheaper, and far
more accurate. Vision OCR via a 13-provider LLM router kicks in only
when the accessibility metadata isn't there. Everything runs on your
machine; the only cloud calls are the LLM requests and (if you opt in)
crash reports.

## Three-bullet version

- **Hybrid sight.** OS accessibility tree + LLM-vision fallback. Sub-
  second element targeting, near-zero false-clicks.
- **Local-first.** Memory, audit ledger, sensors, executor — all on
  your box. The only cloud calls are LLM provider APIs.
- **Self-governing.** Constitution rules + reversibility scoring + a
  user-configurable approval gate. The agent refuses destructive
  actions even when the LLM asks.

## Key facts

| | |
|---|---|
| Project lead | Suhas (creator) |
| Started | 2026-03 |
| Repository | https://github.com/openclaw-ai/openclaw |
| Languages | TypeScript (Node 20), Python 3.12, React |
| Lines of code | ~120k across atrium / hands / aegis / hatchery |
| Supported OS | Windows 10/11 (production), macOS 12+, Linux (alpha) |
| LLM providers | 13: OpenAI, Anthropic, Gemini, Groq, xAI, Mistral, Perplexity, Kimi, OpenRouter, DeepSeek, Bytez, Ollama, LM Studio |
| License | See `LICENSE` in the repo |
| Current status | v0.2-alpha, private testers |
| Target public 1.0 | Phase 3 of ROADMAP.md — date depends on Phase 0/1 verification timeline |

## Differentiators (compared to OpenClaw, GPT-4V agents, RPA tools)

1. **Accessibility primary, vision fallback** — not the other way round.
2. **13 LLM providers behind a capability-aware router** — text / vision
   / fast / cheap routes each pick the right backend.
3. **Cognition stack** — episodic memory, attention scoring, narratives,
   metacognition calibration. The agent remembers across sessions.
4. **Constitution + reversibility** — hard safety rules the LLM can't
   override; reversibility score gates autonomous action.
5. **Audit ledger** — hash-chained log of every action. Tamper-evident.

## Suhas's bio (third person, ~80 words)

Suhas is the creator of Parix. Background in [TBD — please fill in].
Building Parix to scratch a personal itch: a workstation agent that
sees the screen the way the operating system does, not the way GPT-4V
does. Talks publicly about the accessibility moat, the audit chain,
and the trade-off between sandboxed skills and the kind of native
integrations that make the moat possible.

> **TODO:** Suhas to confirm bio copy + provide preferred attribution
> ("Suhas", "Suhas <surname>", or a handle). Add headshot.

## Screenshots / assets

Stored in `docs/assets/`. **Placeholders only** until Suhas's screen
recordings land (ROADMAP.md G4):

- `aegis-dashboard.png` — Aegis UI on first boot.
- `aegis-activity-feed.png` — sensor events streaming in real time.
- `aegis-approval-prompt.png` — the "should I do this?" dialog for a
  reversibility-0.2 action.
- `hatchery-onboarding.png` — Hatchery wake-word selection step.
- `parix-icon-256.png` — square mark, transparent background.
- `parix-wordmark-light.svg`, `parix-wordmark-dark.svg`.

When the launch deck lands, also include:

- `parix-vs-vision.gif` — side-by-side clip showing
  accessibility-targeted click vs. screenshot-based click latency.
- `parix-audit-ledger.png` — a sample of the hash-chained log.

## Logo guidance

- Square mark on a transparent background for app icons.
- Wordmark in light + dark variants for press / web.
- Don't recolor the mark; don't recompose the wordmark.
- Minimum size: 32×32 for the mark, 100px wide for the wordmark.

## Quotes worth saving

> "The point of Parix is that the OS already knows what's on your
> screen. We just had to ask it."
> — Suhas, building log, 2026-04

> "We're shipping a 1.0 only when the audit chain is good enough that
> a regulated workplace would sign off on it. That's the bar."
> — Suhas, ROADMAP.md Phase 3 commit message

> "Vision is the floor. Accessibility is the ceiling."
> — Project tagline candidate

## What we don't want covered (yet)

- Detailed benchmarks vs. OpenClaw. We have internal numbers, but the
  comparison isn't apples-to-apples until both projects have signed
  1.0s. Wait for the comparison-page version on `docs.parix.ai`.
- Pricing. Parix doesn't have a paid tier yet. If we ever do, you'll
  hear about it before any tier appears.
- Speculation about partnerships, fundraising, or hiring. Ask Suhas.

## Reaching us

- **Engineering / open-source questions:** GitHub issues.
- **Press / interview requests:** email Suhas (see contact at top).
- **Security disclosures:** see `docs/filing-bugs.md` § Security.

## Embargo policy

We don't issue formal embargoes — too small a team. If you have a piece
in flight and want to coordinate publish timing with a release, just
ask Suhas; we'll usually try to align.
