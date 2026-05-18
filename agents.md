# 🧠 PARIX — Full Execution Plan (v1.0)
### Post-War-Room Build Blueprint | May 14–20, 2026

---

## 📑 Table of Contents

- [Agent Task Assignment — Claude vs Codex](#-agent-task-assignment--claude-vs-codex)

### Part 1 — v1.0 Execution Plan
1. [Project Summary](#-project-summary)
2. [Objectives & Deliverables](#-objectives--deliverables)
3. [Technical Architecture](#-technical-architecture)
4. [Execution Phases](#-execution-phases)
   - Phase 1 — The Synapse (Day 1–2)
   - Phase 2 — The Council (Day 3–4)
   - Phase 3 — The Eyes & Ears (Day 5)
   - Phase 4 — The Voice (Day 6)
   - Phase 5 — The Demo (Day 7)
5. [Multi-Model LLM Adapter](#-multi-model-llm-adapter)
6. [Scheduler & Cron System](#-scheduler--cron-system)
7. [Task Queue & Debouncer](#-task-queue--debouncer)
8. [Personal Knowledge Graph](#-personal-knowledge-graph-pkg)
9. [User Feedback Loop](#-user-feedback-loop)
10. [Process Management](#-process-management)
11. [Test Suite](#-test-suite)
12. [Resources & Tools](#-resources--tools)
13. [Full OS Access — The Agent Is the Operator](#-full-os-access--the-agent-is-the-operator)
14. [Hybrid Accessibility + Vision Layer — The Technical Moat](#-hybrid-accessibility--vision-layer--the-technical-moat)
15. [Competence Standard — Outperform Top-Tier Employees](#-competence-standard--outperform-top-tier-employees)
16. [Memory Storage Architecture](#-memory-storage-architecture)
17. [Channel Architecture — Personal vs Enterprise](#-channel-architecture)
18. [Risk Assessment](#-risk-assessment)
19. [Success Criteria](#-success-criteria)
20. [Immediate Next Actions](#-immediate-next-actions-next-48-hours)
21. [Daily Checklist](#-one-page-daily-checklist)

### Part 2 — v1.2 Intelligence Upgrade Addendum
1. [What This Adds](#-what-this-adds)
2. [Instrumental Convergence Modules](#-instrumental-convergence--mapped-to-concrete-modules)
3. [Constitution Layer](#1--constitution-layer--goal-content-integrity)
4. [Watchdog Stack](#2--watchdog-stack--self-preservation)
5. [Skill Cache](#3--skill-cache--technological-perfection)
6. [Token Governor](#4--token-governor--resource-acquisition)
7. [Self-Optimizer](#5--self-optimizer--cognitive-enhancement)
8. [Reversibility Scoring](#6--reversibility-scoring--safety-layer)
9. [Intent Prediction](#7--intent-prediction--10-steps-ahead)
10. [Episodic Memory](#8--episodic-memory--narrative-recall)
11. [Confidence Decay](#9--confidence-decay--belief-calibration)
12. [Audit Ledger](#10--audit-ledger--tamper-evident-log)
13. [The Surprise Layer](#11--the-surprise-layer--from-reactive-to-magical)
14. [Updated Phase Integration](#-updated-phase-integration)
15. [Honest Tradeoffs](#-honest-tradeoffs)
16. [Remaining Gaps](#-is-something-still-missing--honest-audit)
17. [Version Capability Matrix](#-version-capability-matrix)

---

## 🤝 Agent Task Assignment — Claude vs Codex

**Split principle:**
- **Claude** owns anything that requires cross-file reasoning, complex state logic, architecture decisions, integration debugging, or security-critical design. Claude reviews all Codex output before it merges.
- **Codex** owns anything that is pattern-following, boilerplate-heavy, structurally repetitive, or can be generated from a clear spec with no cross-module entanglement.

---

### Claude's Scope

| Module / File | Phase | Why Claude |
|---|---|---|
| `shared/protocol.json` | 1 | Contract for the entire system — one wrong field breaks everything |
| `shared/schema.sql` | 1 | Schema relationships affect every module; must be designed holistically |
| `atrium/src/synapse/client.ts` | 1 | ACK tracker, exponential backoff, PARALYZED state, REBOOT_SYNC — complex stateful logic |
| `atrium/src/memory/db.ts` | 1 | SQLite wrapper used everywhere; wrong API design propagates everywhere |
| `atrium/src/council/index.ts` | 2 | Core state machine — every transition has cascading effects |
| `atrium/src/llm/index.ts` | 2 | LLM router + fallback chain — multi-provider reasoning |
| `atrium/src/llm/types.ts` | 2 | Interface design that all 10 adapters must conform to |
| `atrium/src/llm/registry.ts` | 2 | Task-type routing matrix + capability matrix |
| `atrium/src/llm/fallback.ts` | 2 | Fallback chain logic with budget and availability awareness |
| `atrium/src/middleware/preflight.ts` | 2 | CAPABILITY_MISSING guard — security boundary |
| `atrium/src/queue/index.ts` | 2 | Task queue — blocking during ACTING/THINKING, concurrency model |
| `atrium/src/queue/dead-letter.ts` | 2 | DLQ logic — retry semantics, notification policy |
| `atrium/src/channels/types.ts` + `index.ts` + `registry.ts` | 4 | ChannelAdapter interface, ChannelRouter, priority lists, mode-aware selection |
| `atrium/src/channels/telegram.ts` | 4 | Bot webhook + inline keyboard callback + "Apply Fix" confirmation flow |
| `atrium/src/intelligence/constitution.ts` | 2 | Hard safety limits — must never be wrong |
| `atrium/src/intelligence/reversibility.ts` | 4 | Decision matrix for autonomous action blocking |
| `atrium/src/intelligence/watchdog.ts` | 1 | State checkpoint + crash recovery — correctness under failure |
| `atrium/src/intelligence/context-fusion.ts` | 4 | Multi-signal correlation — core surprise architecture |
| `atrium/src/intelligence/recall-daemon.ts` | v0.2 | Entity overlap logic + surfacing policy |
| `atrium/src/intelligence/shadow-prompts.ts` | 4 | Rotating prompt logic + trigger condition evaluation |
| `atrium/src/intelligence/generosity.ts` | 4 | Rate limiting surprise — self-tuning cooldown logic |
| `atrium/tests/integration/synapse.test.ts` | 1 | Full roundtrip integration — can't be spec-followed, must reason about timing |
| `atrium/tests/integration/crash-recovery.test.ts` | 1 | Kill/restart cycles — test design requires reasoning about async state |
| Code review of all Codex output | all | Final check before merges |
| Root cause debugging | all | When things break non-obviously |

---

### Codex's Scope

| Module / File | Phase | Why Codex |
|---|---|---|
| `atrium/src/llm/adapters/gemini.ts` | 2 | Clear pattern: implement `LLMAdapter` interface using `@google/generative-ai` |
| `atrium/src/llm/adapters/openai.ts` | 2 | Same pattern: `openai` SDK |
| `atrium/src/llm/adapters/claude.ts` | 2 | Same pattern: `@anthropic-ai/sdk` |
| `atrium/src/llm/adapters/groq.ts` | 2 | Same pattern: `groq-sdk` |
| `atrium/src/llm/adapters/grok.ts` | 2 | Same pattern: fetch to `api.x.ai` |
| `atrium/src/llm/adapters/mistral.ts` | 2 | Same pattern: `@mistralai/mistralai` SDK |
| `atrium/src/llm/adapters/perplexity.ts` | 2 | Same pattern: fetch to `api.perplexity.ai` |
| `atrium/src/llm/adapters/ollama.ts` | 2 | Same pattern: fetch to `localhost:11434` |
| `atrium/src/llm/adapters/lmstudio.ts` | 2 | Same pattern: fetch to `localhost:1234` |
| `atrium/src/llm/adapters/mock.ts` | 2 | Hardcoded stub — trivially spec-following |
| `atrium/src/scheduler/index.ts` | 2 | Cron registration boilerplate — structured list of jobs |
| `atrium/src/scheduler/jobs/shadow-loop.ts` | 2 | Cron handler stub — calls `runShadowPrompt()` |
| `atrium/src/scheduler/jobs/heartbeat.ts` | 1 | Ping Python + update `hands_status` |
| `atrium/src/scheduler/jobs/event-cleanup.ts` | 2 | DELETE WHERE ts < 7 days |
| `atrium/src/scheduler/jobs/pending-config.ts` | 4 | Check SQLite, Telegram nudge if pending |
| `atrium/src/scheduler/jobs/world-state-snapshot.ts` | 1 | Write Council state to checkpoints table |
| `atrium/src/scheduler/jobs/token-budget.ts` | 4 | Aggregate token_usage, log daily_summary |
| `atrium/src/scheduler/jobs/storage-sync.ts` | 4 | Sync SQLite to cloud provider if configured |
| `atrium/src/intelligence/token-governor.ts` | 4 | Spec is fully defined — threshold logic against SQLite counters |
| `atrium/src/intelligence/skill-cache.ts` | v0.2 | SQLite pattern-match + INSERT ON CONFLICT — spec fully defined |
| `atrium/src/intelligence/self-optimizer.ts` | v0.2 | Weekly cron + SQL aggregation + route update — spec fully defined |
| `atrium/src/intelligence/episodic-memory.ts` | v0.2 | Task clustering + LLM summarize + INSERT — spec fully defined |
| `atrium/src/intelligence/decay.ts` | v0.2 | Daily cron, exponential decay formula per rule — fully specced |
| `atrium/src/intelligence/ledger.ts` | v0.2 | SHA-256 hash chain — spec is exact code |
| `atrium/src/intelligence/intent-predictor.ts` | v0.2 | Sequence lookup + LLM fallback — spec fully defined |
| `atrium/src/queue/debouncer.ts` | 2 | Collapse events within window — straightforward Map + setTimeout |
| `atrium/src/channels/aegis.ts` | 4 | WebSocket relay to Aegis — forward events, no complex logic |
| `atrium/src/channels/adapters/desktop.ts` | 4 | OS notification via `node-notifier` — zero config default |
| `atrium/src/channels/adapters/discord.ts` | 4 | Discord webhook/bot — same pattern as all Tier A adapters |
| `atrium/src/channels/adapters/slack.ts` | 4 | Slack Bolt + Block Kit |
| `atrium/src/channels/adapters/teams.ts` | 4 | Microsoft Teams Graph API + Adaptive Cards |
| `atrium/src/channels/adapters/google-chat.ts` | 4 | Google Chat Cards v2 |
| `atrium/src/channels/adapters/whatsapp.ts` | 4 | Meta Cloud API |
| `atrium/src/channels/adapters/line.ts` | 4 | LINE Messaging API |
| `atrium/src/channels/adapters/feishu.ts` | 4 | Feishu/Lark Open Platform |
| `atrium/src/channels/adapters/mattermost.ts` | 4 | Mattermost REST + webhooks |
| `atrium/src/channels/adapters/signal.ts` | 4 | signal-cli subprocess bridge |
| `atrium/src/channels/adapters/matrix.ts` | 4 | matrix-js-sdk |
| `atrium/src/channels/adapters/nextcloud.ts` | 4 | Nextcloud Talk REST API |
| `atrium/src/channels/adapters/irc.ts` | 4 | irc npm — plaintext, reply-keyword actions |
| `atrium/src/channels/adapters/nostr.ts` | 4 | nostr-tools event publish |
| `atrium/src/channels/adapters/synology.ts` | 4 | Synology Chat webhook |
| `atrium/src/channels/adapters/tlon.ts` | 4 | Urbit HTTP API poke |
| `atrium/src/channels/adapters/twitch.ts` | 4 | tmi.js IRC chat bot |
| `atrium/src/channels/adapters/zalo.ts` | 4 | Zalo OA API |
| `atrium/src/channels/adapters/zalo-personal.ts` | 4 | Zalo unofficial bridge |
| `atrium/src/channels/adapters/wechat.ts` | 4 | WeChat Official Account API |
| `atrium/src/channels/adapters/qq.ts` | 4 | QQ Bot Open Platform |
| `atrium/src/channels/adapters/webchat.ts` | 4 | SSE/WS embedded widget |
| `atrium/src/channels/adapters/imessage.ts` | 4 | AppleScript/shortcuts bridge (macOS) |
| `hands/executor/gws.py` | 4 | GWS CLI executor — gam + googleapis [ENTERPRISE] |
| `hands/executor/msft.py` | 4 | Microsoft 365 CLI executor — m365 CLI [ENTERPRISE] |
| `atrium/src/storage/adapters/local.ts` | 1 | Local filesystem adapter — always on, no config |
| `atrium/src/storage/adapters/onedrive.ts` | 4 | Microsoft OneDrive via Graph API |
| `atrium/src/storage/adapters/azure.ts` | 4 | Azure Blob Storage |
| `atrium/src/storage/adapters/google-drive.ts` | 4 | Google Drive API v3 |
| `atrium/src/storage/adapters/google-cloud.ts` | 4 | Google Cloud Storage bucket |
| `atrium/src/storage/adapters/icloud.ts` | 4 | macOS iCloud Drive folder path — no SDK |
| `atrium/src/storage/adapters/dropbox.ts` | 4 | Dropbox API v2 |
| `atrium/src/storage/adapters/box.ts` | 4 | Box Content API |
| `atrium/src/storage/adapters/mega.ts` | 4 | MEGA zero-knowledge via megajs |
| `atrium/src/storage/adapters/proton.ts` | 4 | Proton Drive REST API |
| `atrium/src/storage/adapters/pcloud.ts` | 4 | pCloud API |
| `atrium/src/storage/adapters/sync-com.ts` | 4 | Sync.com REST API |
| `atrium/src/index.ts` | 1 | Entry point wiring — import and connect modules Claude built |
| `atrium/tests/unit/council.test.ts` | 2 | Test cases are listed verbatim in the plan |
| `atrium/tests/unit/debouncer.test.ts` | 2 | Test cases listed verbatim |
| `atrium/tests/unit/task-queue.test.ts` | 2 | Test cases listed verbatim |
| `atrium/tests/unit/llm-router.test.ts` | 2 | Test cases listed verbatim |
| `atrium/tests/unit/preflight.test.ts` | 2 | Test cases listed verbatim |
| `atrium/tests/integration/sqlite.test.ts` | 1 | Read/write/query — straightforward spec |
| `hands/main.py` | 1 | WS server scaffold — accept connections, dispatch messages |
| `hands/protocol.py` | 1 | Dataclass mirror of `protocol.json` — mechanical translation |
| `hands/sensors/watcher.py` | 3 | Poll loop + pattern match + SENSOR_EVENT emit — spec fully defined |
| `hands/sensors/silent_intent.py` | 3 | 6 detector stubs (start with `idle_after_error`, `read_without_edit`) |
| `hands/executor/cli.py` | 3 | `subprocess.run()` with timeout + result packaging |
| `hands/executor/vision.py` | 3 | `mss` screenshot + return bytes — single function |
| `hands/tests/test_watcher.py` | 3 | Pattern detection unit tests |
| `hands/tests/test_cli.py` | 3 | subprocess + timeout tests |
| `hands/tests/test_bridge.py` | 1 | WS connect + ACK + REBOOT_SYNC tests |
| `aegis/src/App.tsx` | 4 | React scaffold + WS connect |
| `aegis/src/components/CouncilStatus.tsx` | 4 | Display Council state from WS — simple component |
| `aegis/src/components/EventFeed.tsx` | 4 | Render last 10 events — simple list component |
| `hatchery/src/index.ts` | 4 | 4-step Inquirer.js flow — spec is step-by-step in the plan |
| `ecosystem.config.js` | 4 | PM2 config — exact code is in the plan |
| `scripts/demo.sh` / `demo.ps1` | 5 | Scripted demo sequence — linear commands |
| `README.md` | 5 | Install steps + architecture overview |
| `.env.example` | 5 | Key names documentation |

---

### Handoff Protocol

```
Codex writes → opens PR → Claude reviews → Claude merges or requests fix
```

**Claude blocks merge if:**
- Any adapter deviates from `LLMAdapter` interface contract
- Any test uses mocked imports that hide real integration paths
- Any Python executor uses `shell=True` with user input (injection risk)
- Hardcoded ports conflict with Synapse/Aegis port assignment (8765 / 8766)

**Codex must read before starting:**
- `shared/protocol.json` (Claude writes this first — Day 2 morning)
- `atrium/src/llm/types.ts` (Claude writes this first — Day 3 morning)
- `shared/schema.sql` (Claude writes this first — Day 2 morning)

**No Codex task should start until its upstream Claude deliverable exists.**

---

## 🎯 Project Summary

Parix is a polyglot AI agent (Node.js brain, Python hands) that monitors a user's OS in the background and proactively surfaces actionable fixes before being asked. It communicates over a typed WebSocket bridge (Synapse), reasons via Gemini 1.5 Flash, and delivers alerts through Telegram and a local Aegis Web UI.

**This project succeeds when:** Parix detects a real terminal error or high-intent OS state, sends a Telegram DM with a one-click fix, and the entire flow survives a Python process crash and reconnect — all without the user issuing a single command.

> ⚠️ **Assumption flagged:** "The friend watching the demo" was mentioned but never identified. If May 20 is a live demo to a specific person, the Day 7 polish priority may need to shift toward presentation over reliability testing. Clarify before Day 6.

> ⚠️ **Assumption flagged:** Today is May 14 (Day 2). Day 1–2 work (Synapse bridge) has partially begun or is beginning now. The plan accounts for this.

---

## 📦 Objectives & Deliverables

| # | Objective | Deliverable | Measurable Outcome |
|---|-----------|-------------|-------------------|
| 1 | Establish typed bidirectional bridge | `synapse/` WS server (Python) + client (Node) with full protocol | ACK received <200ms on localhost; REBOOT_SYNC triggers World State push |
| 2 | Build Council state machine | `council/index.ts` with 5-state enum + transition logic | Council transitions IDLE→OBSERVING→THINKING→ACTING→IDLE without manual intervention |
| 3 | Integrate Gemini Flash | LLM adapter in Council's THINKING state | Gemini returns structured JSON action plan given a sensor event |
| 4 | Wire Python sensors | `sensors/watcher.py` polling window title + terminal stdout every 2s | SENSOR_EVENTs appear in Atrium logs in real time |
| 5 | Telegram proactive alert | Bot sends DM with error summary + fix button | User receives Telegram message within 5s of error detection |
| 6 | Aegis Web UI (minimal) | React dashboard showing Council state + last event | UI updates live via WebSocket |
| 7 | Hatchery CLI | 4-step Inquirer.js onboarding with skip logic + keytar storage | Fresh machine can run `npm run hatch` and reach IDLE state |
| 8 | Crash recovery | Python restart triggers REBOOT_SYNC; Node resumes pending task | Zero ghost tasks after Python kill + restart |

---

## 🏗️ Technical Architecture

### Monorepo Structure

```
parix/
├── atrium/                  # Node.js/TypeScript — Brain
│   ├── src/
│   │   ├── index.ts         # Atrium entry point + event router
│   │   ├── council/
│   │   │   └── index.ts     # State machine (IDLE→ACTING)
│   │   ├── synapse/
│   │   │   └── client.ts    # WS client + ACK tracker + reconnect
│   │   ├── channels/
│   │   │   ├── index.ts          # ChannelRouter — priority + fallback
│   │   │   ├── types.ts          # ChannelAdapter interface
│   │   │   ├── registry.ts       # Channel registry + mode-aware selection
│   │   │   ├── aegis.ts          # Aegis UI WebSocket relay (always on)
│   │   │   └── adapters/
│   │   │       ├── desktop.ts        # OS notifications (default, zero config)
│   │   │       ├── telegram.ts       # Telegram Bot API
│   │   │       ├── whatsapp.ts       # WhatsApp Business Cloud API
│   │   │       ├── discord.ts        # Discord Bot / webhook
│   │   │       ├── slack.ts          # Slack Events API + Block Kit
│   │   │       ├── teams.ts          # Microsoft Teams Graph API
│   │   │       ├── google-chat.ts    # Google Chat API (Cards v2)
│   │   │       ├── signal.ts         # Signal via signal-cli bridge
│   │   │       ├── matrix.ts         # Matrix Client-Server API
│   │   │       ├── line.ts           # LINE Messaging API
│   │   │       ├── feishu.ts         # Feishu / Lark Open Platform
│   │   │       ├── mattermost.ts     # Mattermost REST API + webhooks
│   │   │       ├── nextcloud.ts      # Nextcloud Talk REST API
│   │   │       ├── irc.ts            # IRC via irc npm (plaintext, no actions)
│   │   │       ├── nostr.ts          # Nostr protocol (publish events)
│   │   │       ├── synology.ts       # Synology Chat webhook
│   │   │       ├── tlon.ts           # Tlon / Urbit Groups poke
│   │   │       ├── twitch.ts         # Twitch chat bot (community alerts)
│   │   │       ├── zalo.ts           # Zalo OA API (Vietnam)
│   │   │       ├── zalo-personal.ts  # Zalo Personal (unofficial bridge)
│   │   │       ├── wechat.ts         # WeChat Official Account API
│   │   │       ├── qq.ts             # QQ Bot framework
│   │   │       └── webchat.ts        # Generic webchat embed (SSE/WS)
│   │   ├── middleware/
│   │   │   └── preflight.ts # CAPABILITY_MISSING guard
│   │   ├── memory/
│   │   │   └── db.ts        # SQLite task log via better-sqlite3
│   │   └── storage/
│   │       ├── index.ts         # StorageManager — sync scheduler + provider selection
│   │       ├── types.ts         # StorageAdapter interface + SyncResult
│   │       ├── encryption.ts    # AES-256 client-side encryption (pre-upload)
│   │       ├── sync.ts          # SQLite backup diff + incremental sync logic
│   │       └── adapters/
│   │           ├── local.ts         # Local filesystem (default, always on)
│   │           ├── onedrive.ts      # Microsoft OneDrive (Graph API)
│   │           ├── azure.ts         # Azure Blob Storage
│   │           ├── google-drive.ts  # Google Drive API
│   │           ├── google-cloud.ts  # Google Cloud Storage
│   │           ├── icloud.ts        # Apple iCloud Drive (macOS folder sync)
│   │           ├── dropbox.ts       # Dropbox API v2
│   │           ├── box.ts           # Box Content API
│   │           ├── mega.ts          # MEGA — zero-knowledge (megajs)
│   │           ├── proton.ts        # Proton Drive — zero-knowledge
│   │           ├── pcloud.ts        # pCloud API — zero-knowledge option
│   │           └── sync-com.ts      # Sync.com REST API — zero-knowledge
│
├── hands/                   # Python — Executor
│   ├── main.py              # WS server entry point
│   ├── sensors/
│   │   ├── watcher.py       # Window title + terminal stdout poll
│   │   └── silent_intent.py # Silent intent detectors (6 detectors)
│   ├── accessibility/       # Hybrid Accessibility + Vision Layer (THE MOAT)
│   │   ├── __init__.py      # AccessibilityBridge — unified interface
│   │   ├── types.py         # UIElement, UITree, AccessibilitySnapshot dataclasses
│   │   ├── windows.py       # UIAutomation via pywinauto/comtypes
│   │   ├── macos.py         # Accessibility API via pyobjc (same API as OpenClaw)
│   │   ├── linux.py         # AT-SPI2 via pyatspi2 (GNOME/KDE)
│   │   ├── vision.py        # OCR fallback — mss screenshot + Tesseract/Gemini vision
│   │   └── fusion.py        # Merge accessibility tree + vision into unified snapshot
│   ├── executor/
│   │   ├── cli.py           # subprocess shell commands (Tier 1)
│   │   ├── vision.py        # mss screenshot (Tier 2)
│   │   ├── gws.py           # Google Workspace CLI executor [ENTERPRISE]
│   │   └── msft.py          # Microsoft 365 CLI executor [ENTERPRISE]
│   └── protocol.py          # Mirrors shared/protocol.json as dataclasses
│
├── aegis/                   # React Web UI
│   └── src/
│       ├── App.tsx
│       └── components/
│           ├── CouncilStatus.tsx
│           └── EventFeed.tsx
│
├── hatchery/                # CLI onboarding
│   └── src/
│       └── index.ts         # Inquirer.js 4-step flow
│
└── shared/
    ├── protocol.json        # Single source of truth for message types
    └── schema.sql           # SQLite table definitions
```

### WebSocket Protocol (shared/protocol.json)

```json
{
  "version": "1.0",
  "message_types": {
    "TASK_REQUEST":    { "from": "atrium",  "fields": ["task_id","type","payload","timestamp"] },
    "TASK_ACK":        { "from": "hands",   "fields": ["task_id","status","timestamp"] },
    "TASK_RESULT":     { "from": "hands",   "fields": ["task_id","success","output","error","timestamp"] },
    "SENSOR_EVENT":    { "from": "hands",   "fields": ["event_type","data","confidence","timestamp"] },
    "HEARTBEAT":       { "both":  true,     "fields": ["timestamp"] },
    "REBOOT_SYNC":     { "from": "hands",   "fields": ["timestamp"] },
    "WORLD_STATE_PUSH":{ "from": "atrium",  "fields": ["last_task","active_state","timestamp"] },
    "CAPABILITY_MISSING":{ "from": "atrium","fields": ["missing","message","timestamp"] },
    "SILENT_INTENT_EVENT": { "from": "hands", "fields": ["intent_type","data","confidence","timestamp"] },
    "ACCESSIBILITY_SNAPSHOT": { "from": "hands", "fields": ["snapshot_id","focused_app","backend_used","tree_summary","confidence","timestamp"] },
    "ERROR":           { "both":  true,     "fields": ["task_id","code","message","timestamp"] }
  }
}
```

### Council State Machine

```
IDLE ──► OBSERVING ──► THINKING ──► ACTING ──► WAITING
  ▲          │              │           │          │
  └──────────┴──────────────┴───────────┘          │
                         ERROR ◄────────────────────┘
```

| Transition | Trigger |
|---|---|
| IDLE → OBSERVING | SENSOR_EVENT received with confidence ≥ 0.6 |
| OBSERVING → THINKING | Event classified as actionable by rule engine |
| THINKING → ACTING | Gemini returns structured action plan |
| ACTING → WAITING | TASK_REQUEST sent, awaiting TASK_RESULT |
| WAITING → IDLE | TASK_RESULT received (success or fail) |
| THINKING → ERROR | LLM response timeout (>10s) — sends "still analyzing..." to user |
| Any → ERROR | ACK timeout (>200ms) or TASK_RESULT error |
| ERROR → IDLE | User resolves or auto-retry after 30s |

---

## 🗺️ Execution Phases

### Phase 1 — The Synapse *(Day 1–2: May 13–14)*
**Goal:** Typed, reliable bidirectional bridge. Nothing else matters until this works.

**Tasks:**
- Create monorepo with `pnpm workspaces` (or `npm workspaces`)
- Write `shared/protocol.json` — this is the contract everything else builds against
- Write `hands/main.py`: Python WebSocket server (use `websockets` library), listens on `ws://localhost:8765`
- Write `atrium/src/synapse/client.ts`: Node WS client with:
  - Auto-reconnect with exponential backoff (max 5 retries)
  - ACK tracker: Map of `task_id → { sent_at, resolve, reject }`
  - If no ACK within 200ms → mark Hands as `PARALYZED`, emit internal event
  - On `REBOOT_SYNC` received → push current World State back to Python
- Write `shared/schema.sql`: Full 16-table DDL (tasks, events, llm_config, dead_letter, user_context, feedback, checkpoints, skill_cache, model_performance, event_sequences, episodes, situations, recall_log, surprises, audit_ledger, token_usage)
- Write `atrium/src/memory/db.ts`: SQLite wrapper (use `better-sqlite3`)
- Write a manual test: Node sends `TASK_REQUEST`, Python ACKs, Python sends `TASK_RESULT`, Node logs to SQLite

**Milestone:** Console shows full `REQUEST → ACK → RESULT` roundtrip in <500ms. Kill Python, restart it, see `REBOOT_SYNC` trigger World State push. ✓

**Exit criteria:** Bridge survives 10 consecutive kill/restart cycles without Node hanging.

---

### Phase 2 — The Council *(Day 3–4: May 15–16)*
**Goal:** The Brain can think. Gemini integration produces structured actions.

**Tasks:**
- Write `atrium/src/council/index.ts`:
  - State enum: `IDLE | OBSERVING | THINKING | ACTING | WAITING | ERROR`
  - `transition(event)` function — pure switch/case, no frameworks
  - Emit state change events to Atrium's event bus
- Write Gemini adapter in THINKING state:
  - System prompt: rolling 500-token world-state summary (updated on every SENSOR_EVENT)
  - User prompt: structured sensor event JSON
  - Expected response: `{ action_type, command, confidence, explanation }`
  - Parse response strictly — if malformed, go to ERROR state
- Write `atrium/src/middleware/preflight.ts`:
  - Before any TASK_REQUEST: check keytar for Gemini key
  - If missing: return `CAPABILITY_MISSING` to caller, log to SQLite, do NOT crash
- Write rule engine (pre-LLM filter):
  - Rules: `window_changed`, `terminal_error_detected`, `repeated_failed_command`, `idle_10min`
  - If no rule matches → stay in OBSERVING (do not call Gemini unnecessarily)
- Connect Council to Synapse: ACTING state sends `TASK_REQUEST` over bridge

**Milestone:** Feed a fake `SENSOR_EVENT` with `{ event_type: "terminal_error", data: "npm ERR! missing module" }` → Council transitions through all states → Gemini returns an action → Synapse sends TASK_REQUEST → SQLite logs full lifecycle. ✓

**Exit criteria:** Council handles malformed Gemini response, ACK timeout, and Python crash without hanging in THINKING or ACTING state.

---

### Phase 3 — The Eyes & Ears *(Day 5: May 17)*
**Goal:** Python actively watches the OS and fires real SENSOR_EVENTs.

**Tasks:**
- Write `hands/sensors/watcher.py`:
  - Poll active window title every 2s using `pygetwindow` (Windows) or `xdotool` (Linux)
  - Poll terminal stdout: tail the last 20 lines of active terminal buffer
  - Detect patterns: `error:`, `ERR!`, `traceback`, `segfault`, `FAILED`
  - Send `SENSOR_EVENT` with `confidence` score (0.0–1.0) based on pattern severity
- Write `hands/executor/cli.py`:
  - Execute shell commands via `subprocess.run()` with timeout
  - Return stdout, stderr, exit code in `TASK_RESULT`
  - NEVER use `shell=True` on user-provided input (injection risk)
- Write `hands/executor/vision.py`:
  - Screenshot via `mss` (faster than PIL)
  - Only triggered by Council — not running constantly
- Test: open a terminal, run `npm install nonexistent-package-xyz`, watch Parix detect the error and log it

**Milestone:** Real terminal error → real SENSOR_EVENT → logged in SQLite within 3 seconds. ✓

**Exit criteria:** Watcher runs for 10 minutes without memory leak (check with `psutil`). False positive rate <20% (test with 10 normal terminal commands).

---

### Phase 4 — The Voice *(Day 6: May 18)*
**Goal:** Parix talks to the user. Telegram DM + Aegis UI go live.

**Tasks:**
- Write `atrium/src/channels/telegram.ts`:
  - Use `node-telegram-bot-api`
  - On `TASK_RESULT` or high-confidence SENSOR_EVENT: send DM with summary + inline keyboard button ("Apply Fix" / "Ignore")
  - "Apply Fix" callback → Council issues TASK_REQUEST to Hands
  - Store Bot Token via `keytar.getPassword('parix', 'telegram_token')`
- Write `aegis/src/` minimal React UI:
  - Connect to Atrium via WebSocket
  - Show: current Council state, last 10 events, last Gemini reasoning
  - "Apply Fix" button that mirrors Telegram callback
  - Serve via `vite` on `localhost:3000`
- Write `hatchery/src/index.ts`:
  - Step 1: Mode select (PERSONAL / ENTERPRISE) via Inquirer.js list
  - Step 2: Gemini API key input → `keytar.setPassword` or skip → `PENDING_CONFIG`
  - Step 3: Telegram bot token input → `keytar.setPassword` or skip
  - Step 4.5: Surveillance Scope — show every signal Parix monitors with toggles:
    - ✅ Active window title (default: ON)
    - ✅ Terminal stdout/stderr (default: ON)
    - ☐ Clipboard content (default: OFF — opt-in only)
    - ✅ File system read access (default: ON)
    - ✅ Process list (default: ON)
    - ✅ Git state (default: ON)
    - ✅ System stats — CPU, RAM, battery (default: ON)
    - ☐ Browser tabs (default: OFF — opt-in only)
    - ✅ Network connections (default: ON)
    - Display: "Parix can only see what you allow. You can change these anytime in Aegis Settings."
    - Also show: Pause Switch hotkey (Ctrl+Shift+P) and "Why did you do that?" command
    - Run first-run integration test: fake a SENSOR_EVENT → verify flow through to configured channel. Surface exact broken component if it fails.
  - Step 5: HATCH — spawn Atrium + Hands as background processes, open `localhost:3000`, exit terminal cleanly
  - Save onboarding state to SQLite: `{ mode, gemini_status, telegram_status, surveillance_scope, hatched_at }`
- Save `PENDING_CONFIG` items to SQLite so Aegis UI can surface "Complete Setup" banner

**Milestone:** Run `npm run hatch` on a clean terminal → complete 4 steps → terminal closes → Aegis opens in browser → trigger a fake error → Telegram DM arrives with inline button → click "Apply Fix" → Hands executes → result appears in Aegis. ✓

**Exit criteria:** Full flow works end-to-end on a single machine. Telegram DM arrives within 5 seconds of error detection.

---

### Phase 5 — The Demo *(Day 7: May 19–20)*
**Goal:** The demo is bulletproof. No live debugging on May 20.

**Tasks:**
- Write `scripts/demo.sh` (or `.ps1` on Windows):
  - Starts Parix in clean state
  - Runs a scripted terminal error (`npm install fake-error-package`)
  - Waits for Telegram DM
  - This is the rehearsal script — run it 10 times
- Stress-test bridge: kill Python 20 times, verify zero ghost tasks in SQLite
- Write `README.md` with exact install steps (another person should be able to run it from scratch)
- Set up `.env.example` with all required keys documented
- Final check: does it work if Gemini API is rate-limited? (Add fallback: log the error, send Telegram: "I detected an issue but need a moment to think.")
- Record a 60-second screen capture of the demo flow as backup

**Milestone:** Demo runs cleanly 3 times in a row without intervention. ✓

**Exit criteria:** You can walk away from the keyboard, trigger the demo script, and the Telegram DM arrives without touching anything.

---

## 🤖 Multi-Model LLM Adapter

Parix must never be locked to one provider. The Council's THINKING state routes through a unified adapter layer. The user picks their model in the Hatchery; the adapter handles the rest.

### Supported Providers

| ID | Name | Type | Best For | Key Required |
|---|---|---|---|---|
| `gemini` | Google Gemini | Cloud | Shadow Loop (1M context) | Yes |
| `openai` | OpenAI ChatGPT | Cloud | General reasoning, code | Yes |
| `claude` | Anthropic Claude | Cloud | Complex analysis, long docs | Yes |
| `groq` | Groq | Cloud | Speed (fastest inference) | Yes |
| `grok` | xAI Grok | Cloud | Realtime web knowledge | Yes |
| `mistral` | Mistral / Codestral | Cloud | Code tasks specifically | Yes |
| `perplexity` | Perplexity Sonar | Cloud | Tasks needing web search | Yes |
| `copilot` | Microsoft Copilot | Cloud | Enterprise/Azure users | Yes | *(reuses `openai.ts` adapter with `baseURL: 'https://api.githubcopilot.com'` — no separate `copilot.ts` file needed; configure via registry)* |
| `ollama` | Ollama | Local | Privacy, offline use | No |
| `lmstudio` | LM Studio | Local | Privacy, custom models | No |
| `mock` | Mock Model | Internal | Testing, no-key fallback | No |

### Adapter Architecture

```
atrium/src/llm/
├── index.ts           # LLMRouter — selects provider, runs fallback chain
├── types.ts           # LLMProvider, LLMRequest, LLMResponse interfaces
├── registry.ts        # Provider registry + capability matrix
├── adapters/
│   ├── gemini.ts      # @google/generative-ai SDK
│   ├── openai.ts      # openai SDK (also handles Copilot + LM Studio)
│   ├── claude.ts      # @anthropic-ai/sdk
│   ├── groq.ts        # groq-sdk (OpenAI-compatible)
│   ├── grok.ts        # fetch to api.x.ai (OpenAI-compatible)
│   ├── mistral.ts     # @mistralai/mistralai SDK
│   ├── perplexity.ts  # fetch to api.perplexity.ai (OpenAI-compatible)
│   ├── ollama.ts      # fetch to localhost:11434 (OpenAI-compatible)
│   ├── lmstudio.ts    # fetch to localhost:1234 (OpenAI-compatible)
│   └── mock.ts        # Returns hardcoded valid LLMResponse — always works
└── fallback.ts        # Fallback chain logic
```

### Unified Interface

```typescript
// types.ts
interface LLMRequest {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  max_tokens?: number;
  temperature?: number;
  task_type?: 'reasoning' | 'code' | 'search' | 'fast';
}

interface LLMResponse {
  content: string;
  provider: string;
  model: string;
  tokens_used: number;
  latency_ms: number;
}

interface LLMAdapter {
  id: string;
  name: string;
  models: string[];
  isLocal: boolean;
  isAvailable(): Promise<boolean>;
  complete(req: LLMRequest): Promise<LLMResponse>;
}
```

### Smart Routing by Task Type

Not every task needs the same model. Route by `task_type`:

```typescript
// registry.ts — capability matrix
const TASK_ROUTING: Record<string, string[]> = {
  reasoning: ['claude', 'openai', 'gemini'],   // deep analysis
  code:      ['mistral', 'openai', 'groq'],     // codestral is best for code
  search:    ['perplexity', 'grok', 'gemini'],  // perplexity has live web
  fast:      ['groq', 'gemini', 'openai'],      // groq is fastest inference
  shadow:    ['gemini', 'groq', 'mock'],        // shadow loop — cheap + fast
  offline:   ['ollama', 'lmstudio', 'mock'],    // no internet needed
};
```

### Fallback Chain

```
User's selected model
      ↓ (if unavailable or rate-limited)
Groq llama-3.3-70b  (fast, generous free tier)
      ↓ (if unavailable)
Gemini 1.5 Flash    (large context)
      ↓ (if unavailable)
Mock Model          (always works — returns safe hardcoded response)
```

### Model Config in SQLite

```sql
CREATE TABLE llm_config (
  provider    TEXT PRIMARY KEY,
  model       TEXT NOT NULL,
  api_key_ref TEXT,              -- keytar key name, not the key itself
  enabled     INTEGER DEFAULT 1,
  priority    INTEGER DEFAULT 5, -- lower = higher priority
  token_spend INTEGER DEFAULT 0  -- lifetime token counter
);
```

### Provider-Specific Notes

- **Groq**: Use `llama-3.3-70b-versatile` — fastest inference on the market, generous free tier
- **Grok**: `api.x.ai` uses OpenAI-compatible endpoints — reuse `openai.ts` adapter with different baseURL
- **Copilot**: Microsoft exposes an OpenAI-compatible endpoint — same pattern as Grok
- **Ollama**: Must be running locally (`ollama serve`). Hatchery should check `localhost:11434/api/tags` to list available models
- **LM Studio**: Must be running locally with server mode on. OpenAI-compatible on `localhost:1234`
- **Perplexity Sonar**: Use for SENSOR_EVENTs that require live web context (e.g., "is this npm package deprecated?")
- **Mock**: Returns `{ action_type: "cli", command: "echo 'mock fix applied'", confidence: 0.75 }` — above 0.6 Council threshold so integration tests exercise the full pipeline. Override via `MOCK_CONFIDENCE` env var for edge-case testing

---

## ⏰ Scheduler & Cron System

Without scheduled work, Parix is purely reactive. The Shadow Loop and all background intelligence live here.

```
atrium/src/scheduler/
├── index.ts       # CronManager — register, start, stop all jobs
└── jobs/
    ├── shadow-loop.ts        # Every 60s (15s on high-confidence): query Gemini "is user stuck?"
    ├── heartbeat.ts          # Every 5s: ping Python, update hands_status
    ├── event-cleanup.ts      # Every midnight: delete events older than 7 days
    ├── pending-config.ts     # Every 60s: if PENDING_CONFIG exists, nudge via Telegram
    ├── world-state-snapshot.ts # Every 60s: write Council state to SQLite checkpoint
    ├── token-budget.ts       # Every hour: log total token spend across all providers
    └── storage-sync.ts       # Every 15min: sync SQLite to cloud provider (if configured)
```

### Cron Schedule

```typescript
// index.ts — job registry
const JOBS = [
  { id: 'shadow_loop',    cron: '*/60 * * * * *',  handler: shadowLoop    },  // 60s baseline; accelerates to 15s when recent event confidence > 0.7
  { id: 'heartbeat',      cron: '*/5 * * * * *',   handler: heartbeat     },
  { id: 'event_cleanup',  cron: '0 0 * * *',        handler: eventCleanup  },
  { id: 'pending_config', cron: '*/60 * * * * *',   handler: pendingConfig },
  { id: 'world_snapshot', cron: '*/60 * * * * *',   handler: worldSnapshot },
  { id: 'token_budget',   cron: '0 * * * *',         handler: tokenBudget   },
  { id: 'storage_sync',  cron: '*/15 * * * *',       handler: storageSync   },  // only runs if cloud/hybrid storage configured
];
```

### Shadow Loop Logic

```
Every 60s (accelerates to 15s when recent event confidence > 0.7):
1. Read last 10 events from SQLite
2. Check: has user been idle >5 min? Same error repeated >2 times? No progress in 10 min?
3. If yes → build context snapshot → call LLM (task_type: 'shadow')
4. If LLM confidence > 0.75 → push suggestion to Aegis UI (subtle — no Telegram interruption)
5. If confidence > 0.9 → send Telegram DM
6. Log shadow loop result to SQLite (shadow_runs table)
```

---

## 🚦 Task Queue & Debouncer

```
atrium/src/queue/
├── index.ts          # TaskQueue — FIFO, blocks while Council is ACTING/THINKING
├── debouncer.ts      # Collapses duplicate SENSOR_EVENTs within 5s window
└── dead-letter.ts    # Tasks failed 3x → DLQ → log → notify user once
```

### Debounce Rules

```typescript
const DEBOUNCE_RULES = {
  terminal_error:   5000,  // ms — same error within 5s = one event
  window_changed:   1000,  // ms
  idle_detected:   10000,  // ms
  clipboard_change: 2000,  // ms
};
```

### Dead Letter Queue

```sql
CREATE TABLE dead_letter (
  task_id     TEXT PRIMARY KEY,
  event_type  TEXT,
  payload     TEXT,
  attempts    INTEGER,
  last_error  TEXT,
  created_at  DATETIME,
  notified    INTEGER DEFAULT 0
);
```

---

## 🧠 Personal Knowledge Graph (PKG)

Minimal v0.1 PKG. Not a vector database — a typed SQLite table fed into every Gemini system prompt.

```sql
CREATE TABLE user_context (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  source      TEXT,  -- 'hatchery_interview' | 'inferred' | 'user_explicit'
  confidence  REAL DEFAULT 1.0,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed rows from Hatchery Day-One Interview:
-- primary_language, active_project, preferred_stack, fix_style, never_do
```

PKG rows injected into every LLM system prompt:

```typescript
function buildSystemPrompt(pkg: UserContext[]): string {
  const context = pkg.map(r => `${r.key}: ${r.value}`).join('\n');
  return `You are Parix, a proactive OS agent.\nUser context:\n${context}\n\nAlways return JSON.`;
}
```

---

## 🔄 User Feedback Loop

```sql
CREATE TABLE feedback (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id     TEXT NOT NULL,
  event_type  TEXT,
  action      TEXT,  -- 'applied' | 'ignored' | 'dismissed' | 'modified'
  timestamp   DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Learning rule:** If same `event_type` gets `ignored` 3+ times → write to `user_context`:
```
key: "ignore_event_<event_type>", value: "true", source: "inferred"
```

This means Parix permanently stops interrupting the user for that event type.

---

## ⚙️ Process Management

```
parix/
└── ecosystem.config.js    # PM2 config for both processes
```

```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'parix-atrium',
      script: './atrium/dist/index.js',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      env: { NODE_ENV: 'production', PORT: 3000 }
    },
    {
      name: 'parix-hands',
      script: './hands/main.py',
      interpreter: 'python3',
      watch: false,
      autorestart: true,
      max_restarts: 10
    }
  ]
};
```

**Health check endpoint** (Atrium exposes):
```
GET /health → { status, council_state, hands_status, uptime_s, pending_tasks, last_event }
```

---

## 🧪 Test Suite

```
parix/
├── atrium/
│   └── tests/
│       ├── unit/
│       │   ├── council.test.ts       # State machine transitions
│       │   ├── debouncer.test.ts     # Deduplication logic
│       │   ├── task-queue.test.ts    # FIFO ordering, concurrent block
│       │   ├── llm-router.test.ts    # Provider selection, fallback chain
│       │   └── preflight.test.ts    # CAPABILITY_MISSING guard
│       └── integration/
│           ├── synapse.test.ts       # Full REQUEST→ACK→RESULT roundtrip
│           ├── sqlite.test.ts        # Task log read/write/query
│           └── crash-recovery.test.ts # Kill Python, verify REBOOT_SYNC
│
└── hands/
    └── tests/
        ├── test_watcher.py           # SENSOR_EVENT pattern detection
        ├── test_cli.py               # subprocess execution, timeout, injection guard
        └── test_bridge.py            # WS connect, ACK send, REBOOT_SYNC broadcast
```

### Node.js Test Runner: Vitest

```json
// atrium/package.json
{
  "scripts": {
    "test":       "vitest run",
    "test:watch": "vitest",
    "test:cover": "vitest run --coverage"
  },
  "devDependencies": {
    "vitest": "^1.0.0",
    "@vitest/coverage-v8": "^1.0.0"
  }
}
```

### Python Test Runner: Pytest

```bash
pip install pytest pytest-asyncio pytest-cov
pytest hands/tests/ --cov=hands --cov-report=term-missing
```

### Test Scenarios

**Pass 1 — Unit (run on every save):**
```
✓ Council: IDLE → OBSERVING on confidence ≥ 0.6
✓ Council: stays IDLE on confidence < 0.6
✓ Council: Any → ERROR on ACK timeout
✓ Council: ERROR → IDLE after 30s auto-retry
✓ Debouncer: 5 same events in 3s → collapses to 1
✓ Debouncer: 2 different events in 3s → passes both
✓ Task Queue: new event blocked while Council is ACTING
✓ LLM Router: selects groq for task_type 'fast'
✓ LLM Router: falls back to mock when all providers fail
✓ Preflight: returns CAPABILITY_MISSING if no Gemini key
```

**Pass 2 — Integration (run before each phase milestone):**
```
✓ Synapse: REQUEST → ACK arrives <200ms
✓ Synapse: Kill Python → Node marks PARALYZED within 1s
✓ Synapse: Restart Python → REBOOT_SYNC triggers World State push
✓ Synapse: 10 consecutive kill/restart cycles → zero ghost tasks in SQLite
✓ SQLite: task written, state updated, read back correctly
✓ SQLite: event cleanup deletes records older than 7 days
```

**Pass 3 — End-to-End (run on Day 6 and Day 7):**
```
✓ Full flow: fake terminal error → SENSOR_EVENT → Council → Gemini → TASK_REQUEST → TASK_RESULT → Telegram DM
✓ Hatchery: npm run hatch → 4 steps → spawns both processes → Aegis opens
✓ Skip flow: skip all Hatchery steps → PENDING_CONFIG in SQLite → Aegis shows banner
✓ Feedback: click Ignore 3 times → user_context updated → event suppressed
✓ Shadow Loop: idle 5min → suggestion appears in Aegis UI
```

**Pass 4 — Stress (run on Day 7 only):**
```
✓ 100 SENSOR_EVENTs in 1s → debouncer collapses to ≤5 unique events
✓ 20 Python kill/restart cycles in 60s → no memory leak, no zombie processes
✓ Gemini rate-limited (mocked) → fallback to Groq → fallback to mock → Telegram "analyzing..."
✓ Council runs 1 hour without memory leak (psutil RSS < 100MB)
```

### Mock Model Usage

All tests in Pass 1 and Pass 2 use the Mock adapter — no real API keys needed:

```typescript
// vitest.setup.ts
process.env.PARIX_LLM_PROVIDER = 'mock';
```

Mock always returns:
```json
{
  "action_type": "cli",
  "command": "echo 'mock fix applied'",
  "confidence": 0.75,
  "explanation": "Mock: detected test error pattern"
}
```

---

## 🔧 Resources & Tools

| Category | Item | Purpose | Notes |
|----------|------|---------|-------|
| Runtime | Node.js 20+ | Atrium, Council, Hatchery | Use LTS |
| Runtime | Python 3.11+ | Hands, Sensors | pyautogui is BANNED — steals focus, breaks on user input |
| Package manager | pnpm | Monorepo workspaces | Faster than npm for monorepos |
| Bridge | `ws` (npm) | WebSocket client in Node | Lightweight, no framework |
| Bridge | `websockets` (pip) | WebSocket server in Python | Async, stable |
| DB | `better-sqlite3` | Task log, world state | Sync API, no async complexity |
| Secrets | `keytar` (npm) | OS keychain API key storage | Replaces encrypted SQLite |
| TUI | `inquirer` (npm) | Hatchery onboarding flow | v8 — check ESM/CJS compat |
| Sensors | `pygetwindow` / `xdotool` | Active window title | Platform-dependent |
| Vision | `mss` | Fast screenshots | Faster than PIL |
| LLM | Gemini 1.5 Flash API | Council THINKING state | 1M context window |
| Notifications | `node-notifier` | OS desktop notifications | Default channel — zero config |
| UI | React + Vite + Tailwind | Aegis Web UI | Keep it minimal |
| Enterprise | `@googleapis/chat` | Google Chat Cards v2 | Needs GWS service account |
| Enterprise | `@microsoft/microsoft-graph-client` | Teams Adaptive Cards | Needs Azure app registration |
| Enterprise | `gam` (GWS CLI) / `m365` (MS CLI) | Workspace action execution | Python subprocess via `gws.py` / `msft.py` |
| OS | Windows primary | Dev environment | Test Linux on Day 7 if time |

---

## 🧠 Full OS Access — The Agent Is the Operator

In personal mode, Parix is not monitoring the device. **Parix is operating the device.** There are no toggles, no surveillance consent screens, no permission popups for reading. You hired an employee and gave them a workstation. They can see the screen, read the clipboard, open any file, check what's running, and look at what you're working on — because that's how they do their job.

The agent reads everything it needs to in order to outperform the best human employee. It doesn't ask "can I look at your clipboard?" — it looks, because a great assistant would.

### What Parix Has Access To

| Sense | What It Reads | Why |
|---|---|---|
| **Vision** | Active window title, browser tabs, open files, screenshots (automatic + on-demand) | Understands what the user is looking at and working on |
| **Terminal** | All terminal stdout/stderr — piped, PTY, or accessibility-scraped | Primary error and intent signal |
| **Clipboard** | Full clipboard content — text, images, code | Knows what the user just copied — often reveals immediate intent |
| **File System** | Full read access to entire device, write access within workspace | Reads docs, configs, logs, downloads — anything a smart employee would check |
| **Processes** | Full process list, resource usage, parent/child trees | Detects builds running, apps crashing, resource exhaustion |
| **Git** | All repos — branches, diffs, commit history, stash, remotes | Understands what changed, what's staged, what's stuck |
| **System** | CPU, RAM, disk, battery, network state, OS version | Schedules heavy work when resources are free, warns before battery dies |
| **Browser** | Open tabs, recent history, active search queries | Understands what the user is researching — the strongest intent signal |
| **Network** | Active connections, DNS lookups, API call patterns | Detects failed API calls, timeout patterns, connectivity issues |
| **Installed Software** | Package managers, system apps, dev tools | Knows the user's toolchain — never suggests something that isn't installed |
| **Calendar / Schedule** | OS calendar integration (if available) | Knows when to be quiet, when a meeting is about to start, when a deadline is approaching |
| **Notifications** | OS notification stream | Sees what other apps are telling the user — avoids duplicate alerts |

### What Parix Will Never Touch

These are not toggles. They are architectural impossibilities — the code does not exist.

| Boundary | Reason |
|---|---|
| Keylogging (raw keystroke capture) | Captures passwords and private messages. A great employee doesn't need to watch your fingers to do their job — they watch the screen, the output, the result. |
| Camera / microphone | Physical space is not the agent's domain. Period. |
| Exfiltrating data to unauthorized endpoints | The agent works for the user. Loyalty is structural, not configurable. |

### Autonomous Operation — No Hand-Holding

Parix in personal mode operates like a **senior employee with judgment**, not an intern who asks before every action:

| Situation | Intern Agent (wrong) | Senior Agent (Parix) |
|---|---|---|
| Detects npm install failure | "I noticed an error. Want me to look into it?" | Reads the error, checks the lockfile, clears cache, reinstalls, reports: "Fixed — stale lockfile." |
| User idle 10 min after error | Waits for user to ask | Analyzes error, researches fix, prepares suggestion, surfaces it |
| Git conflict on pull | "You have a merge conflict. Want me to help?" | Reads both sides, determines intent from recent commits, resolves if confidence > 0.9, otherwise presents the two options with its recommendation |
| Build breaks in CI | "CI failed." | Pulls CI logs, diffs against last green commit, identifies the breaking change, suggests the fix, optionally opens the PR |
| 3 AM — user's cron job fails | Nothing — user is asleep | Fixes it autonomously if reversible. If not, queues the fix and sends a morning summary: "Your ETL broke at 3:12 AM. I patched the date parser. Here's the diff." |

### The Only Gate: Irreversibility

Parix asks for confirmation in exactly one scenario: **the action is irreversible AND high-impact.**

```typescript
// Updated constitution.ts — personal mode

const PERSONAL_CONSTITUTION = {
  // These are the ONLY actions requiring confirmation in personal mode
  require_confirm: [
    "git_force_push",      // can destroy remote history
    "rm_recursive_outside_workspace",  // can destroy personal files
    "send_to_external_api_first_time", // first contact with unknown endpoint
    "financial_transaction",           // money is always irreversible
    "system_shutdown_or_reboot",       // interrupts everything
  ],

  // Everything else — the agent just does it
  autonomous: [
    "file_create", "file_edit", "file_delete_in_workspace",
    "git_commit", "git_push", "git_branch", "git_merge",
    "install_package", "uninstall_package",
    "run_shell_command", "run_build", "run_tests",
    "send_message_to_configured_channels",
    "take_screenshot", "read_clipboard", "read_any_file",
    "create_pr", "comment_on_pr", "close_issue",
    "search_web", "query_api",
  ],

  // Hard limits — no override possible
  impossible: [
    "keylog", "camera", "microphone",
    "exfiltrate_to_unapproved_endpoint",
    "store_credentials_in_plaintext",
  ]
};
```

---

## 👁️ Hybrid Accessibility + Vision Layer — The Technical Moat

> **Full spec:** [`accessibility-layer.md`](accessibility-layer.md)

Parix's primary differentiator over OpenClaw. Cross-platform accessibility API (UIAutomation on Windows, AXUIElement on macOS, AT-SPI2 on Linux) + vision fallback + fusion. OpenClaw reads the screen like a DOM. Generic agents read it like a photograph. **Parix reads it like both.**

| Competitor | Accessibility | Vision | Cross-Platform | Fusion |
|-----------|--------------|--------|----------------|--------|
| **OpenClaw** | macOS only | No | No | No |
| **Generic AI agents** | No | Screenshot + GPT-4V | Some | No |
| **Parix** | Win + Mac + Linux | mss + Tesseract/Gemini | Yes | **Yes** |

**Build:** Claude owns `types.py` + `__init__.py` + `fusion.py`. Codex owns per-platform backends. Windows Day 5, macOS/Linux v0.2.

---

## 🏆 Competence Standard — Outperform Top-Tier Employees

Parix is not a helper. It's a replacement for the work a $200K/year senior engineer or ops person does — except it works 24/7, never forgets, never gets tired, and gets smarter every day.

### What "Outperform" Actually Means

| Dimension | Top-Tier Human Employee | Parix |
|---|---|---|
| **Context switching** | Can hold 3-4 projects in head, drops threads after a few days | Holds unlimited projects, every thread, forever — nothing is forgotten |
| **Reaction time** | Sees error in terminal → reads → thinks → acts in 30-120 seconds | Sees error → analyzes → acts in 2-5 seconds |
| **Knowledge recall** | "I think we fixed this before... let me check Slack" | Instant: "You fixed this exact error on April 3rd. Here's what you did. Applying the same fix." |
| **Working hours** | 8-10h/day, weekends off, vacation, sick days | 24/7/365. Fixes your 3 AM cron job while you sleep. |
| **Cross-domain** | Strong in their specialty, weak outside it | Reads your frontend, backend, infra, CI/CD, docs — all at the same depth |
| **Pattern recognition** | Notices patterns after weeks of repeated exposure | Detects patterns from first occurrence via sequence learning + episodic recall |
| **Ego / politics** | May avoid admitting uncertainty, may resist feedback | Escalates instantly when confidence is low. Zero ego. Adapts to every correction permanently. |
| **Onboarding** | 2-6 weeks to become productive in a new codebase | Reads the entire repo in seconds. Productive from minute one. |
| **Consistency** | Has good days and bad days | Same quality every time. No fatigue, no Monday brain. |
| **Proactivity** | Best employees sometimes anticipate needs | Anticipates needs systematically via Intent Predictor + Shadow Loop + Recall Daemon |

### The Three Levels of Competence Parix Must Demonstrate

**Level 1 — Reliable Executor (Day 1)**
Does what you ask, correctly, every time. No hand-holding. No "did you mean...?" on obvious tasks. A human intern fails here.

**Level 2 — Proactive Problem Solver (Week 1)**
Detects problems before you notice them. Fixes things without being asked. Surfaces relevant context from past work. A mid-level employee sometimes does this.

**Level 3 — Strategic Anticipator (Week 3+)**
Predicts what you'll need before you need it. Connects dots across projects, timelines, and past episodes that no human could hold in memory. Suggests approaches you haven't considered by synthesizing patterns across your entire work history. **No human employee at any salary consistently operates here.** This is where Parix earns its place.

### How This Maps to Architecture

| Competence Level | Architectural Component | Data Needed |
|---|---|---|
| Level 1 | Rule Engine + LLM Router + Skill Cache | Protocol + immediate sensor data |
| Level 2 | Shadow Loop + Context Fusion + Feedback Loop | 3-7 days of accumulated events |
| Level 3 | Episodic Memory + Recall Daemon + Intent Predictor + Rotating Shadow Prompts | 2-4 weeks of episodes + sequences + skill cache |

The agent gets smarter over time **by design, not by accident.** Level 3 is not a feature — it's an emergent property of the data accumulation strategy that starts logging on Day 1.

---

## 🗄️ Memory Storage Architecture

Parix's memory (PKG, episodes, skill cache, task log, checkpoints, audit ledger) lives in SQLite by default. In cloud or hybrid mode, this database is backed up to a user-selected storage provider on a configurable schedule.

### Storage Modes

| Mode | Where Data Lives | Offline Access | Multi-Device Sync | Privacy |
|---|---|---|---|---|
| **Local** | SQLite on device only | Yes | No | Maximum — data never leaves device |
| **Cloud** | Provider only (no local copy) | No | Yes | Depends on provider |
| **Hybrid** | Local primary + cloud backup | Yes | Yes (on sync) | Local-first, cloud as backup |

**Default: Local.** User must explicitly opt into cloud or hybrid in Hatchery. Parix never pushes data to cloud without consent.

### Provider Tiers by Privacy Model

#### Zero-Knowledge Providers (recommended for sensitive data)
The provider cannot read your data. Encryption keys never leave your device.

| Provider | SDK | Free Tier | Notes |
|---|---|---|---|
| **MEGA** | `megajs` | 20 GB | NZ law, zero-knowledge, generous free tier |
| **Proton Drive** | Proton REST API | 1 GB free | Swiss law, strongest privacy guarantees |
| **pCloud** | `pcloud-sdk-js` | 10 GB | Swiss-based, lifetime plans, zero-knowledge option |
| **Sync.com** | REST API | 5 GB | Canadian PIPEDA compliance, healthcare/legal focus |

#### Standard Cloud (client-side encryption applied before upload)
Provider *could* read your data unless we encrypt first. Parix encrypts with AES-256 before upload when using these providers.

| Provider | SDK | Notes |
|---|---|---|
| **Google Drive** | `googleapis` (Drive v3) | Reuses GWS credentials if enterprise mode |
| **Google Cloud Storage** | `@google-cloud/storage` | Better for large databases, bucket-based |
| **Microsoft OneDrive** | `@microsoft/microsoft-graph-client` | Reuses M365 credentials if enterprise mode |
| **Azure Blob Storage** | `@azure/storage-blob` | Enterprise standard, fine-grained access control |
| **Dropbox** | `dropbox` npm | Cross-platform, simple API |
| **Box** | `box-node-sdk` | Enterprise compliance focus (HIPAA, FedRAMP) |
| **Apple iCloud** | macOS iCloud Drive folder sync | macOS only — no Node.js API; uses iCloud Drive folder as target path |

### Storage Adapter Interface (Claude owns)

```typescript
// atrium/src/storage/types.ts

interface SyncResult {
  status: 'success' | 'conflict' | 'no_change' | 'error';
  bytes_uploaded?: number;
  remote_newer?: boolean;   // true = cloud has newer version (multi-device)
  error?: string;
}

interface StorageAdapter {
  id: string;
  name: string;
  isZeroKnowledge: boolean;        // provider cannot see data natively
  requiresEncryption: boolean;     // true = we must AES-256 before upload
  isConfigured(): boolean;
  isAvailable(): Promise<boolean>;
  upload(remotePath: string, data: Buffer): Promise<void>;
  download(remotePath: string): Promise<Buffer>;
  getRemoteModifiedTime(remotePath: string): Promise<number>;
  sync(localPath: string, remotePath: string): Promise<SyncResult>;
  delete(remotePath: string): Promise<void>;
}
```

### Encryption Layer (Claude owns)

Applied automatically for all non-zero-knowledge providers before any upload:

```typescript
// atrium/src/storage/encryption.ts
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

export function encrypt(data: Buffer, passphrase: string): Buffer {
  const salt = randomBytes(32);
  const key = scryptSync(passphrase, salt, 32);
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Layout: [salt(32)] [iv(16)] [authTag(16)] [encrypted]
  return Buffer.concat([salt, iv, authTag, encrypted]);
}

export function decrypt(data: Buffer, passphrase: string): Buffer {
  const salt = data.subarray(0, 32);
  const iv = data.subarray(32, 48);
  const authTag = data.subarray(48, 64);
  const encrypted = data.subarray(64);

  const key = scryptSync(passphrase, salt, 32);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}
```

The passphrase is derived from the user's device identity (machine UUID + keytar secret) — never stored in plaintext, never transmitted.

### Sync Strategy (Claude owns)

```typescript
// atrium/src/storage/sync.ts

export async function syncMemory(adapter: StorageAdapter): Promise<SyncResult> {
  const localPath = config.get('db_path');           // e.g. ~/.parix/memory.db
  const remotePath = 'parix/memory.db';

  // Check remote freshness (multi-device conflict detection)
  const remoteTs = await adapter.getRemoteModifiedTime(remotePath).catch(() => 0);
  const localTs = fs.statSync(localPath).mtimeMs;

  if (remoteTs > localTs + 5000) {
    // Remote is newer — prompt user before overwriting local
    return { status: 'conflict', remote_newer: true };
  }

  const raw = fs.readFileSync(localPath);
  const payload = adapter.requiresEncryption
    ? encrypt(raw, await getEncryptionPassphrase())
    : raw;

  await adapter.upload(remotePath, payload);
  return { status: 'success', bytes_uploaded: payload.length };
}
```

**Sync schedule (Cron):**
- Every 15 minutes during active session
- Immediately after any episodic memory write
- On Parix shutdown (graceful)
- Never during a TASK_REQUEST execution (avoid partial-write corruption)

### What Gets Synced

| Data | Synced | Reason |
|---|---|---|
| `memory.db` (full SQLite) | Yes | Primary sync target |
| PKG (`user_context` table) | Yes | Identity travels with user |
| Episodic memory | Yes | Recall daemon needs history |
| Skill cache | Yes | Don't re-learn on new device |
| Checkpoints | Yes | Resume state across reboots |
| Audit ledger | Yes (enterprise only) | Compliance |
| API keys / tokens | **Never** | Stored in keytar, never in SQLite, never uploaded |
| Raw sensor data | **Never** | Too large, too sensitive |

### Hatchery Storage Selection (Step 2.5)

```
Step 2.5: Memory storage mode

  ◉ Local only (default — data never leaves this device)
  ○ Hybrid   — local primary, cloud backup
  ○ Cloud    — cloud primary (requires internet for full access)

  If hybrid or cloud selected:

  ─── Zero-knowledge (recommended) ──────────────
  ○ MEGA           — 20 GB free, NZ privacy law
  ○ Proton Drive   — 1 GB free, Swiss law (strongest)
  ○ pCloud         — 10 GB free, lifetime plans
  ○ Sync.com       — 5 GB free, healthcare/legal compliant

  ─── Standard cloud (Parix encrypts before upload) ──
  ○ Google Drive         → OAuth login
  ○ Google Cloud Storage → service account JSON
  ○ Microsoft OneDrive   → Microsoft login
  ○ Azure Blob Storage   → connection string
  ○ Dropbox             → OAuth login
  ○ Box                 → OAuth login
  ○ Apple iCloud         → macOS only — uses iCloud Drive folder path

  Encryption passphrase: [auto-generated from device identity] [custom]
```

### Task Assignment — Storage

| File | Owner |
|---|---|
| `storage/types.ts` | **Claude** |
| `storage/index.ts` (StorageManager + cron scheduling) | **Claude** |
| `storage/encryption.ts` (AES-256-GCM) | **Claude** |
| `storage/sync.ts` (conflict detection + sync logic) | **Claude** |
| `storage/adapters/local.ts` | **Codex** |
| `storage/adapters/onedrive.ts` | **Codex** |
| `storage/adapters/azure.ts` | **Codex** |
| `storage/adapters/google-drive.ts` | **Codex** |
| `storage/adapters/google-cloud.ts` | **Codex** |
| `storage/adapters/icloud.ts` | **Codex** |
| `storage/adapters/dropbox.ts` | **Codex** |
| `storage/adapters/box.ts` | **Codex** |
| `storage/adapters/mega.ts` | **Codex** |
| `storage/adapters/proton.ts` | **Codex** |
| `storage/adapters/pcloud.ts` | **Codex** |
| `storage/adapters/sync-com.ts` | **Codex** |

---

## 📡 Channel Architecture

### Personal vs Enterprise Mode

Parix is **one product, two runtime modes**. Mode is set at Hatchery onboarding and stored in SQLite.

| Dimension | Personal | Enterprise |
|---|---|---|
| Who runs it | Individual, local machine | IT/DevOps, server or cloud |
| Who talks to it | Only the owner | Any team member via `@parix` mention |
| PKG scope | Individual habits + projects | Shared team context + per-user overlay |
| Audit ledger | Optional | Mandatory — tamper-evident |
| Channel set | Personal messaging apps | Org-approved platforms |
| Executor scope | Local files, terminal, personal APIs | CI/CD, Jira, GWS, M365, shared repos |
| Trust model | Owner approves everything | Role-based — admins approve irreversible actions |
| Privacy | All local | Org controls data residency |
| Working hours | Always on | Configurable quiet hours per team |

**The AI in enterprise mode acts like a team member with a handle.** Anyone can `@parix` in Slack or Teams. It escalates to a human when confidence is below threshold, logs every action to the audit ledger, and respects role permissions. It has a job title and scope defined by the admin in Hatchery.

---

### Channel Registry

#### Tier A — Full Bot API + Rich Actions (inline buttons, callbacks)

These support the complete feedback loop: send alert → user clicks "Apply Fix" → Parix receives callback → executes.

| Channel | SDK / Method | Mode | Actions? | Owner |
|---|---|---|---|---|
| **Desktop** | `node-notifier` | Both | No | Codex |
| **Telegram** | `node-telegram-bot-api` | Personal | Yes | Claude |
| **WhatsApp** | Meta Cloud API (`whatsapp-cloud-api`) | Both | Yes | Codex |
| **Discord** | `discord.js` | Personal | Yes | Codex |
| **Slack** | `@slack/bolt` + Block Kit | Enterprise | Yes | Codex |
| **Microsoft Teams** | Graph API + Adaptive Cards | Enterprise | Yes | Codex |
| **Google Chat** | `@googleapis/chat` + Cards v2 | Enterprise | Yes | Codex |
| **LINE** | `@line/bot-sdk` | Personal | Yes | Codex |
| **Feishu / Lark** | Lark Open Platform SDK | Enterprise | Yes | Codex |
| **Mattermost** | REST API + webhooks | Enterprise | Yes | Codex |

#### Tier B — Protocol-Level or Limited Actions

These can send messages but have no inline button callbacks. Parix monitors for keyword replies instead (`yes`, `apply`, `ignore`).

| Channel | SDK / Method | Mode | Actions? | Owner |
|---|---|---|---|---|
| **Signal** | `signal-cli` subprocess bridge | Personal | No (reply keyword) | Codex |
| **Matrix** | `matrix-js-sdk` | Both | No (reply keyword) | Codex |
| **Nextcloud Talk** | REST API | Enterprise | No (reply keyword) | Codex |
| **Nostr** | `nostr-tools` (publish events) | Personal | No | Codex |
| **Synology Chat** | Webhook + incoming bot | Enterprise | No (reply keyword) | Codex |
| **IRC** | `irc` npm | Personal | No (reply keyword) | Codex |
| **Webchat** | SSE / embedded WS widget | Both | Yes (custom UI) | Codex |

#### Tier C — Consumer Apps (Restricted APIs or Unofficial Bridges)

These require extra setup, regional compliance (WeChat/QQ need Chinese business registration), or unofficial bridges.

| Channel | Method | Mode | Constraint | Owner |
|---|---|---|---|---|
| **iMessage** | AppleScript / `shortcuts` CLI (macOS only) | Personal | macOS + signed-in Apple ID required | Codex |
| **WeChat** | WeChat Official Account API | Both | Chinese business registration required | Codex |
| **QQ** | QQ Bot Open Platform | Personal | Tencent approval required | Codex |
| **Zalo** | Zalo OA API | Personal | Vietnam — Zalo developer account | Codex |
| **Zalo Personal** | Unofficial bridge (zalojs) | Personal | Fragile — Zalo may block | Codex |
| **Tlon / Urbit** | Urbit HTTP API (`poke` to `%groups`) | Personal | Requires running Urbit ship | Codex |
| **Twitch** | `tmi.js` IRC-based chat bot | Personal | For community/stream alerts only | Codex |

---

### Channel Interface (Claude owns)

```typescript
// atrium/src/channels/types.ts

interface ChannelMessage {
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'critical';
  actions?: { label: string; callback_id: string }[];
  task_id?: string;
  metadata?: Record<string, unknown>;
}

interface ChannelAdapter {
  id: string;
  name: string;
  tier: 'A' | 'B' | 'C';
  mode: 'personal' | 'enterprise' | 'both';
  isConfigured(): boolean;
  isAvailable(): Promise<boolean>;
  supportsActions(): boolean;
  send(message: ChannelMessage): Promise<void>;
  onAction?(callback_id: string, task_id: string): void;
}
```

### Channel Router (Claude owns)

```typescript
// atrium/src/channels/index.ts

const PERSONAL_PRIORITY  = ['desktop','telegram','whatsapp','discord','signal','line','matrix','irc','nostr','webchat','synology','nextcloud','tlon','twitch','zalo','zalo-personal','wechat','qq','imessage'];
const ENTERPRISE_PRIORITY = ['desktop','slack','teams','google-chat','feishu','mattermost','matrix','nextcloud','webchat','whatsapp','telegram'];

export async function notify(message: ChannelMessage): Promise<void> {
  const mode = config.get('mode');  // 'personal' | 'enterprise'
  const priority = mode === 'enterprise' ? ENTERPRISE_PRIORITY : PERSONAL_PRIORITY;

  const active = priority
    .map(id => registry.get(id))
    .filter(ch => ch?.isConfigured() && ch.mode !== (mode === 'enterprise' ? 'personal' : 'enterprise'));

  if (active.length === 0) {
    aegis.notify(message);  // Aegis is always the last resort — never fully silent
    return;
  }

  const targets = message.severity === 'critical' ? active : active.slice(0, 1);
  await Promise.allSettled(targets.map(ch => ch.send(message)));
}
```

---

### Enterprise Executors (GWS + Microsoft)

These are **executor skills** in `hands/executor/`, not channels. They let Parix take actions inside Google Workspace and Microsoft 365 when running in enterprise mode.

```
hands/executor/
├── cli.py      # Local shell — always available
├── vision.py   # Screenshot — always available
├── gws.py      # Google Workspace CLI [ENTERPRISE] — wraps `gam` or googleapis
└── msft.py     # Microsoft 365 CLI [ENTERPRISE] — wraps `m365` CLI
```

**`gws.py` can execute:**
- Create/share Google Drive files and folders
- Send Google Chat messages on behalf of service account
- Create Google Calendar events and invites
- Manage Gmail labels and filters
- Run arbitrary `gam` commands for Workspace admin actions

**`msft.py` can execute:**
- Create Teams meetings and channels
- Manage SharePoint files and lists
- Send Outlook calendar invites
- Query and update Microsoft Planner tasks
- Run arbitrary `m365` CLI commands

```python
# hands/executor/gws.py  (Codex owns)
import subprocess, json

ALLOWED_GAM_COMMANDS = ["info", "show", "create", "update", "add", "print"]

def execute(action: str, payload: dict) -> dict:
    if not any(action.startswith(cmd) for cmd in ALLOWED_GAM_COMMANDS):
        return {"success": False, "error": f"gam command not in allowlist: {action}"}
    result = subprocess.run(
        ["gam"] + action.split() + _build_args(payload),
        capture_output=True, text=True, timeout=30
    )
    return {"success": result.returncode == 0, "output": result.stdout, "error": result.stderr}
```

**Security rule (Claude enforces in Constitution):** GWS and M365 executors only activate in enterprise mode. In personal mode, calling them returns `CAPABILITY_BLOCKED`.

---

### Hatchery Channel Selection (updated Step 3)

```
Step 3: Communication channels
  ─── Always on ──────────────────────────
  ✅ Desktop notifications (zero config)
  ✅ Aegis Web UI (zero config)

  ─── Personal channels ──────────────────
  ☐ Telegram        → bot token
  ☐ WhatsApp        → Meta Cloud API key + phone number ID
  ☐ Discord         → webhook URL or bot token
  ☐ Signal          → signal-cli path + registered number
  ☐ LINE            → channel access token
  ☐ Matrix          → homeserver URL + access token
  ☐ Nostr           → private key (nsec)
  ☐ IRC             → server, port, nickname
  ☐ iMessage        → macOS only, no config needed
  ☐ WeChat          → AppID + AppSecret (Chinese reg required)
  ☐ QQ              → Bot App ID (Tencent approval required)
  ☐ Zalo            → OA Access Token
  ☐ Tlon / Urbit    → ship URL + code
  ☐ Twitch          → OAuth token + channel name
  ☐ Synology Chat   → incoming webhook URL
  ☐ Nextcloud Talk  → server URL + token

  ─── Enterprise channels (enterprise mode only) ──
  ☐ Slack           → bot token + signing secret
  ☐ Microsoft Teams → Azure app ID + tenant ID
  ☐ Google Chat     → service account JSON
  ☐ Feishu / Lark   → App ID + App Secret
  ☐ Mattermost      → server URL + personal access token
  ☐ Webchat embed   → generates embed snippet for your intranet

  ─── Enterprise executors ────────────────
  ☐ Google Workspace CLI  → service account JSON + `gam` installed
  ☐ Microsoft 365 CLI     → Azure credentials + `m365` CLI installed
```

---

## ⚠️ Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **pygetwindow fails on target OS** | High | High — sensors blind | Test Day 5 morning first. Fallback: parse active process list via `psutil` instead | 
| **No channels configured** | Low | Low — desktop notification always fires as fallback | Desktop adapter requires zero config; Parix is never fully silent |
| **Telegram bot token not ready** | Low | Low — not the only channel | Desktop + Aegis cover demo day if Telegram isn't ready |
| **WeChat / QQ require regional business registration** | High | Medium — blocks those adapters | Flag clearly in Hatchery; skip gracefully with "requires approval" message |
| **iMessage only on macOS** | High | Low — many alternatives | Detect OS at startup; hide iMessage option on non-macOS |
| **signal-cli subprocess requires Java runtime** | Medium | Medium — Signal adapter dead without it | Document in README; Hatchery checks `signal-cli --version` before enabling |
| **Gemini API rate limit during demo** | Medium | High — Council hangs in THINKING | Add hard 10s timeout on Gemini call. On timeout: send "analyzing..." Telegram message, retry once |
| **ACK timeout false positives on slow machine** | Medium | Medium — ghost ERROR states | Make ACK timeout configurable. Set 500ms during dev, tighten to 200ms for demo |
| **keytar native compilation fails** | Low | High — entire Hatchery broken | Test keytar install on Day 1. Fallback: `.env` file with warning |
| **unref() + detached process leaves zombie** | Medium | Medium — Hands runs after Atrium dies | Implement SIGTERM handler in Python. On Atrium disconnect: Python shuts down gracefully after 30s |
| **Aegis UI websocket conflicts with Synapse port** | Low | Low | Use separate ports: Synapse on 8765, Aegis relay on 8766 |
| **Demo audience is non-technical** | Unknown | Medium — wrong demo focus | Clarify who's watching before Day 6. If non-technical: emphasise Telegram DM, hide terminal logs |

---

## ✅ Success Criteria

**Leading indicators (you're on track):**
- Day 2 end: `REQUEST → ACK → RESULT` roundtrip logged in SQLite
- Day 4 end: Council state machine transitions visible in console without manual prompting
- Day 5 end: Real terminal error appears as SENSOR_EVENT within 3 seconds

**Lagging indicators (project succeeded):**
- May 20: Demo runs 3 times without intervention
- Telegram DM arrives within 5 seconds of error
- Python kill + restart recovers in <5 seconds with no ghost tasks

**Failure threshold (pivot or cut):**
- If Synapse bridge is not stable by end of Day 3 → cut Aegis UI, deliver Telegram-only
- If Gemini integration is not working by Day 5 → replace with hardcoded action rules for demo
- If Hatchery is not complete by Day 6 morning → run demo from `npm run dev` directly, skip polished onboarding

---

## 🚀 Immediate Next Actions (Next 48 Hours)

These are your Day 2 tasks. Today. In order.

1. **Create the monorepo now.** Run: `mkdir parix && cd parix && npm init -y && mkdir atrium hands shared aegis hatchery`
2. **Write `shared/protocol.json` first.** Copy the schema from this document. This is your contract — everything builds against it.
3. **Write `shared/schema.sql`.** Full schema with all 16 tables needed across all modules. Use a `schema/` folder with one file per module composed at boot, or a single DDL file. Core tables: `tasks`, `events`, `llm_config`, `dead_letter`, `user_context`, `feedback`, `checkpoints`, `skill_cache`, `model_performance`, `event_sequences`, `episodes`, `situations`, `recall_log`, `surprises`, `audit_ledger`, `token_usage`. Build them all now — every module depends on its table existing at startup.
4. **Write `hands/main.py`.** Python WebSocket server. Accept connections, log received messages, send back a hardcoded `TASK_ACK` for any `TASK_REQUEST`. Get this green before writing Node code.
5. **Write `atrium/src/synapse/client.ts`.** Connect to Python. Send one `TASK_REQUEST`. Assert ACK arrives. Log to SQLite. This is your integration test.
6. **Create your Telegram bot RIGHT NOW** via @BotFather. Takes 2 minutes. Store the token somewhere safe. Do not wait until Day 6.
7. **Test `keytar` install:** `npm install keytar` and run a quick store/retrieve test. If it fails (native build issue), know this on Day 2, not Day 6.

---

## 📋 One-Page Daily Checklist

| Day | Date | Primary Goal | Hard Stop Milestone |
|-----|------|-------------|---------------------|
| 2 | May 14 | Synapse live | `REQUEST→ACK→RESULT` in SQLite + Watchdog Python thread live |
| 3 | May 15 | Council + Constitution | Council state machine + Constitution layer passes preflight check |
| 4 | May 16 | Gemini + intelligence logging | Gemini returns structured action + Generosity Governor active + all logging tables writing (model_performance, event_sequences, skill_cache, episodes) |
| 5 | May 17 | Real sensors + silent intent | Real terminal error → real SENSOR_EVENT + 2 silent intent detectors live (`idle_after_error`, `read_without_edit`) |
| 6 | May 18 | End-to-end + trust UI | End-to-end flow once + Surveillance Scope in Hatchery + Reversibility scoring + Token Governor |
| 7 | May 19 | Demo hardening | Demo works 3x + Pause Switch + "Why did you do that?" command + first-run integration test |
| Demo | May 20 | Ship it | — |

---
# 🧠 PARIX — Intelligence Upgrade (v1.2 Addendum)
### Smartness + Surprise — Instrumental Convergence, Cognitive Amplifiers, and the Surprise Layer
### Companion to: `agents.md` (Execution Plan v1.0)

---

## 🎯 What This Adds

The v1.0 plan makes Parix **reliable**. This addendum makes Parix **smart**.

v1.0 already has: LLM Router, Cron, PKG, Feedback, Task Queue, PM2, Tests, Debouncer.

What's still missing — the cognitive layers that turn a reactive agent into a genuinely autonomous one:

| Layer | What It Does | Convergent Drive It Satisfies |
|---|---|---|
| **Constitution** | Hard rules the Council checks before every action | Goal-Content Integrity |
| **Watchdog Stack** | Self-healing on crash, state checkpoints, recovery | Self-Preservation |
| **Skill Cache** | Learns from solved problems, skips redundant LLM calls | Technological Perfection |
| **Token Governor** | Auto-throttles spend, switches to cheaper models | Resource Acquisition |
| **Self-Optimizer** | Routes models by historical performance per task type | Cognitive Enhancement |
| **Reversibility Scoring** | Blocks irreversible actions without explicit confirm | Safety / Trust |
| **Intent Prediction** | Pre-fetches context before the user asks | "10 steps ahead" |
| **Episodic Memory** | Narrative recall, not just task logs | Long-horizon coherence |
| **Confidence Decay** | PKG rows go stale automatically | Belief calibration |
| **Audit Ledger** | Tamper-evident log for enterprise mode | Compliance / Trust |
| **Context Fusion** | Correlates multi-signal state into a unified situation | Surprise prerequisite |
| **Silent Intent Detectors** | Catches what the user almost did but didn't | Tier 3 surprise |
| **Recall Daemon** | Proactively surfaces forgotten-but-relevant past episodes | Tier 2 surprise |
| **Generosity Governor** | Caps unsolicited proactive actions to prevent creepiness | Trust preservation |
| **Rotating Shadow Prompts** | 4 different "what's missing" questions instead of 1 | Surprise diversity |

---

## 🧬 Instrumental Convergence — Mapped to Concrete Modules

Bostrom/Omohundro: any sufficiently goal-directed agent autonomously develops these sub-goals. We don't fight them — we **bake them in safely** so they emerge as designed features, not silent attack surfaces.

```
parix/
└── atrium/src/intelligence/
    ├── constitution.ts       # Goal-Content Integrity — immutable rules
    ├── watchdog.ts           # Self-Preservation — restart, checkpoint, recover
    ├── skill-cache.ts        # Technological Perfection — cache solutions
    ├── token-governor.ts     # Resource Acquisition — compute budget
    ├── self-optimizer.ts     # Cognitive Enhancement — learn best routes
    ├── reversibility.ts      # Safety scoring — block irreversible ops
    ├── intent-predictor.ts   # Pre-fetch — predict next request
    ├── episodic-memory.ts    # Narrative recall
    ├── decay.ts              # Confidence aging on PKG
    ├── ledger.ts             # Tamper-evident audit log
    ├── context-fusion.ts     # SURPRISE: multi-signal correlation
    ├── recall-daemon.ts      # SURPRISE: proactive memory retrieval
    ├── generosity.ts         # SURPRISE: daily budget governor
    └── shadow-prompts.ts     # SURPRISE: rotating Shadow Loop prompts

parix/
└── hands/sensors/
    └── silent_intent.py      # SURPRISE: detects unasked questions
```

---

## 1. 🏛️ Constitution Layer — Goal-Content Integrity

The Council reads this before **every** TASK_REQUEST. Violations are rejected with `CAPABILITY_BLOCKED`, not silently passed.

### File: `atrium/src/intelligence/constitution.ts`

```typescript
interface Constitution {
  hard_limits: string[];      // Never violated — no override
  soft_preferences: string[]; // Bias toward, can be overridden by explicit user command
  require_confirm: string[];  // Trigger reversibility check
}

const CONSTITUTION: Constitution = {
  hard_limits: [
    "never_delete_outside_safe_workspace",
    "never_send_message_without_confirm_if_confidence_below_0.9",
    "never_execute_financial_transactions_autonomously",
    "never_store_api_keys_in_plaintext",
    "never_run_shell_true_with_user_input",
    "never_exfiltrate_files_to_external_endpoints"
  ],
  soft_preferences: [
    "prefer_cli_over_gui_automation",
    "prefer_reversible_over_irreversible",
    "prefer_ask_over_assume_when_ambiguity_above_0.3",
    "prefer_local_model_for_sensitive_data"
  ],
  require_confirm: [
    "file_delete", "file_overwrite", "network_post",
    "git_push", "git_force", "system_shutdown"
  ]
};

export function preflightCheck(task: TaskRequest): 
  { allowed: boolean; reason?: string } {
  for (const limit of CONSTITUTION.hard_limits) {
    if (violatesLimit(task, limit)) {
      return { allowed: false, reason: `hard_limit:${limit}` };
    }
  }
  if (CONSTITUTION.require_confirm.includes(task.action_type)) {
    if (!task.user_confirmed) {
      return { allowed: false, reason: "requires_user_confirm" };
    }
  }
  return { allowed: true };
}
```

**Integration:** Council's `THINKING → ACTING` transition calls `preflightCheck` first. Rejected tasks emit `CAPABILITY_BLOCKED` to the user via Telegram + Aegis with the reason. Logged to `audit_ledger`.

**Build time:** 0.5 day. Stamp this into the plan at Phase 2 (Day 3).

---

## 2. 🛡️ Watchdog Stack — Self-Preservation

PM2 already handles Atrium auto-restart. This goes further — **state continuity** across restarts.

### File: `atrium/src/intelligence/watchdog.ts`

```typescript
interface WorldStateCheckpoint {
  council_state: CouncilState;
  pending_tasks: Task[];
  last_event_id: string;
  pkg_snapshot_hash: string;
  timestamp: number;
}

// Cron: every 60s — write checkpoint to SQLite
export async function snapshot(): Promise<void> {
  const state: WorldStateCheckpoint = {
    council_state: council.getState(),
    pending_tasks: taskQueue.peek(10),
    last_event_id: db.lastEventId(),
    pkg_snapshot_hash: hashPKG(),
    timestamp: Date.now()
  };
  db.prepare(`
    INSERT INTO checkpoints (data, ts) VALUES (?, ?)
  `).run(JSON.stringify(state), state.timestamp);
  
  // Keep only last 100 checkpoints
  db.prepare(`
    DELETE FROM checkpoints WHERE id NOT IN
    (SELECT id FROM checkpoints ORDER BY ts DESC LIMIT 100)
  `).run();
}

// On Atrium startup — resume from last checkpoint
export async function resumeFromCheckpoint(): Promise<void> {
  const last = db.prepare(`
    SELECT data FROM checkpoints ORDER BY ts DESC LIMIT 1
  `).get();
  
  if (!last) return; // Fresh start
  
  const state: WorldStateCheckpoint = JSON.parse(last.data);
  
  // Restore council to last known IDLE state (never resume mid-ACTING)
  council.setState(state.council_state === 'ACTING' ? 'IDLE' : state.council_state);
  
  // Pending tasks → push back into queue
  state.pending_tasks.forEach(t => taskQueue.enqueue(t));
  
  logger.info(`Resumed from checkpoint ${state.timestamp}`);
}
```

### Python Watchdog Thread

```python
# hands/main.py — at startup
import threading

def watchdog_loop():
    while True:
        time.sleep(5)
        if not bridge.is_connected():
            logger.warn("Bridge disconnected, attempting reconnect")
            bridge.reconnect_with_backoff()
        if not sensors.is_alive():
            logger.warn("Sensor thread died, restarting")
            sensors.restart()

threading.Thread(target=watchdog_loop, daemon=True).start()
```

### Schema Addition

```sql
CREATE TABLE checkpoints (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  data      TEXT NOT NULL,
  ts        INTEGER NOT NULL
);
CREATE INDEX idx_checkpoints_ts ON checkpoints(ts DESC);
```

**Build time:** 1 day. Add to Phase 1 (Day 2 stretch).

---

## 3. 🎓 Skill Cache — Technological Perfection

When the Council solves something, save the solution. Next time the pattern matches, **skip the LLM entirely** and execute the cached fix.

### File: `atrium/src/intelligence/skill-cache.ts`

```sql
CREATE TABLE skill_cache (
  pattern_hash   TEXT PRIMARY KEY,    -- normalized hash of event_type + error signature
  pattern_text   TEXT NOT NULL,       -- human-readable for debugging
  solution_json  TEXT NOT NULL,       -- the LLMResponse that worked
  success_count  INTEGER DEFAULT 1,
  fail_count     INTEGER DEFAULT 0,
  model_used     TEXT,
  avg_latency_ms INTEGER,
  last_used_at   DATETIME,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

```typescript
export function tryCache(event: SensorEvent): LLMResponse | null {
  const hash = patternHash(event);
  const row = db.prepare(`
    SELECT * FROM skill_cache 
    WHERE pattern_hash = ? AND success_count >= 3 AND fail_count < success_count / 2
  `).get(hash);
  
  if (!row) return null;
  
  db.prepare(`
    UPDATE skill_cache SET last_used_at = CURRENT_TIMESTAMP WHERE pattern_hash = ?
  `).run(hash);
  
  return JSON.parse(row.solution_json);
}

export function recordOutcome(event: SensorEvent, response: LLMResponse, success: boolean) {
  const hash = patternHash(event);
  if (success) {
    db.prepare(`
      INSERT INTO skill_cache (pattern_hash, pattern_text, solution_json, model_used, avg_latency_ms)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(pattern_hash) DO UPDATE SET
        success_count = success_count + 1,
        avg_latency_ms = (avg_latency_ms + ?) / 2,
        last_used_at = CURRENT_TIMESTAMP
    `).run(hash, event.signature, JSON.stringify(response), response.provider, response.latency_ms, response.latency_ms);
  } else {
    db.prepare(`UPDATE skill_cache SET fail_count = fail_count + 1 WHERE pattern_hash = ?`).run(hash);
  }
}
```

**Council integration:**
```
THINKING state:
1. tryCache(event) → cached solution? execute it directly (skip LLM)
2. else → call LLMRouter
3. After TASK_RESULT → recordOutcome(event, response, success)
```

**Effect:** After a week of use, ~40% of tasks should hit the cache. Massive token savings + sub-100ms responses.

**Build time:** 1 day. Add to Phase 2 (Day 4 stretch) or Phase 5 polish.

---

## 4. 💰 Token Governor — Resource Acquisition

Not crypto money — **compute budget management** across providers.

### File: `atrium/src/intelligence/token-governor.ts`

```typescript
interface BudgetConfig {
  daily_token_limit: number;     // e.g. 200_000
  per_task_max_tokens: number;   // e.g. 4_000
  throttle_threshold: number;    // 0.8 — switch to cheaper model at 80%
  hard_stop_threshold: number;   // 0.95 — switch to mock at 95%
}

interface UsageSnapshot {
  used_today: number;
  by_provider: Record<string, number>;
  reset_at: number; // unix ts
}

export function governorDecide(
  request: LLMRequest, 
  selectedProvider: string
): { provider: string; reason: string } {
  const usage = currentUsage();
  const ratio = usage.used_today / budget.daily_token_limit;
  
  if (ratio >= budget.hard_stop_threshold) {
    return { provider: "mock", reason: "budget_hard_stop" };
  }
  
  if (ratio >= budget.throttle_threshold) {
    // Force cheap path: groq or ollama
    if (isAvailable("groq")) return { provider: "groq", reason: "budget_throttle" };
    if (isAvailable("ollama")) return { provider: "ollama", reason: "budget_throttle" };
    return { provider: "mock", reason: "budget_throttle_no_cheap" };
  }
  
  return { provider: selectedProvider, reason: "within_budget" };
}
```

### Schema

```sql
CREATE TABLE token_usage (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  provider    TEXT NOT NULL,
  model       TEXT,
  tokens_in   INTEGER,
  tokens_out  INTEGER,
  cost_usd    REAL,
  task_id     TEXT,
  ts          DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_usage_ts ON token_usage(ts);
```

**Cron:** Daily at midnight — reset counters, log yesterday's spend to a `daily_summary` table, optionally Telegram a daily summary.

**Build time:** 0.5 day. Phase 4 (Day 6).

---

## 5. 🧪 Self-Optimizer — Cognitive Enhancement

Watches its own performance. Learns which model is best per task type. Adjusts routing automatically.

### File: `atrium/src/intelligence/self-optimizer.ts`

```sql
CREATE TABLE model_performance (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  task_type     TEXT NOT NULL,
  provider      TEXT NOT NULL,
  model         TEXT,
  latency_ms    INTEGER,
  success       INTEGER,         -- 1 or 0 — based on user feedback or task completion
  user_action   TEXT,            -- 'applied' | 'ignored' | 'modified'
  ts            DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Weekly Cron Analysis

```typescript
// Cron: '0 0 * * 0' — every Sunday midnight
export async function analyzeAndReroute() {
  const stats = db.prepare(`
    SELECT 
      task_type, 
      provider,
      AVG(success) AS success_rate,
      AVG(latency_ms) AS avg_latency,
      COUNT(*) AS sample_size
    FROM model_performance
    WHERE ts > datetime('now', '-7 days')
    GROUP BY task_type, provider
    HAVING sample_size >= 10
  `).all();
  
  // For each task_type, find the provider with best (success_rate * weight - latency_normalized)
  const newRouting: Record<string, string[]> = {};
  for (const taskType of TASK_TYPES) {
    const candidates = stats.filter(s => s.task_type === taskType);
    const ranked = candidates.sort((a, b) => 
      scoreProvider(b) - scoreProvider(a)
    );
    newRouting[taskType] = ranked.map(r => r.provider);
  }
  
  // Update registry — non-destructive, keep fallback chain intact
  updateTaskRouting(newRouting);
  
  logger.info('Self-optimizer updated routing', newRouting);
}

function scoreProvider(s: any): number {
  // Success weighted heavily, latency penalty
  return s.success_rate * 100 - (s.avg_latency / 100);
}
```

**Effect:** After 2–3 weeks of usage, routing adapts to *your specific workload*. If Claude does better on your codebase than GPT-4o, Parix learns that. No manual config.

**Build time:** 1 day. v0.2 — but the **logging** to `model_performance` should start on Day 4 so data accumulates.

---

## 6. ↩️ Reversibility Scoring — Safety Layer

Before any action, score it 0.0–1.0 on reversibility. Low scores trigger mandatory confirm regardless of LLM confidence.

### File: `atrium/src/intelligence/reversibility.ts`

```typescript
const REVERSIBILITY_SCORES: Record<string, number> = {
  // Fully reversible
  "log":           1.0,
  "screenshot":    1.0,
  "read_file":     1.0,
  "search_web":    1.0,
  
  // Easily reversible
  "create_file":   0.9,   // can delete
  "move_to_trash": 0.9,   // can restore
  "git_stash":     0.9,
  
  // Reversible with effort
  "edit_file":     0.7,   // can revert if backed up
  "git_commit":    0.6,   // can amend/revert
  "install_pkg":   0.5,   // can uninstall but side effects
  
  // Hard to reverse
  "delete_file":   0.2,
  "git_push":      0.2,
  "send_message":  0.2,   // can't unsend
  "send_email":    0.1,
  
  // Irreversible
  "git_force_push": 0.0,
  "rm_recursive":   0.0,
  "system_shutdown":0.0,
  "financial_tx":   0.0,
};

export function shouldConfirm(action: string, confidence: number): boolean {
  const reversibility = REVERSIBILITY_SCORES[action] ?? 0.5;

  // Personal mode: the agent acts. It only asks when the damage is permanent.
  if (config.get('mode') === 'personal') {
    // Only confirm truly irreversible + high-impact
    return reversibility === 0.0;  // git_force_push, rm_recursive, financial_tx, system_shutdown
  }
  
  // Enterprise mode: tighter controls — role-based
  if (reversibility <= 0.3) return true;
  if (confidence < 0.85) return true;
  return false;
}
```

**Personal mode:** The agent almost never asks. It acts like a senior employee — does the right thing, reports what it did. The only gate is truly irreversible actions (score 0.0). Everything else is autonomous.

**Enterprise mode:** Tighter. Role-based permissions layer on top. Junior roles require confirm on more actions than admin roles.

**Build time:** 0.5 day. Phase 4 (Day 6).

---

## 7. 🔮 Intent Prediction — "10 Steps Ahead"

The Master Context's central promise. Without this, Parix is reactive — not predictive.

### File: `atrium/src/intelligence/intent-predictor.ts`

```typescript
interface IntentPrediction {
  predicted_next_event: string;
  probability: number;
  preload_action?: string;
  reasoning: string;
}

// Cron: every 30s during active session
export async function predictNext(): Promise<IntentPrediction | null> {
  const recent = db.prepare(`
    SELECT event_type, data, ts FROM events 
    ORDER BY ts DESC LIMIT 10
  `).all();
  
  if (recent.length < 3) return null;  // Need history
  
  // Pattern-based prediction (cheap, no LLM)
  const sequence = recent.map(e => e.event_type).join(',');
  const patternMatch = db.prepare(`
    SELECT next_event, COUNT(*) AS freq FROM event_sequences
    WHERE sequence = ?
    GROUP BY next_event ORDER BY freq DESC LIMIT 1
  `).get(sequence);
  
  if (patternMatch && patternMatch.freq > 5) {
    return {
      predicted_next_event: patternMatch.next_event,
      probability: patternMatch.freq / 10,
      reasoning: "pattern_match"
    };
  }
  
  // LLM-based prediction for novel patterns (expensive — only every 5 min)
  if (Date.now() - lastLLMPredict > 300_000) {
    return await llmPredict(recent);
  }
  
  return null;
}

// Sequence learning — runs after every TASK_RESULT
export function learnSequence(events: Event[]) {
  for (let i = 3; i < events.length; i++) {
    const sequence = events.slice(i-3, i).map(e => e.event_type).join(',');
    const next = events[i].event_type;
    db.prepare(`
      INSERT INTO event_sequences (sequence, next_event)
      VALUES (?, ?)
    `).run(sequence, next);
  }
}
```

### Schema

```sql
CREATE TABLE event_sequences (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  sequence      TEXT NOT NULL,    -- comma-joined event_types
  next_event    TEXT NOT NULL,
  observed_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_seq_lookup ON event_sequences(sequence);
```

**Pre-load action:** If prediction probability > 0.7 and predicted event is `terminal_error`, pre-warm a Gemini context with the user's recent commands. When the error actually fires, the response is instant because context is already cached.

**Build time:** 1 day. v0.2 — but **start logging sequences** on Day 4 so data accumulates.

---

## 8. 📖 Episodic Memory — Narrative Recall

Not just task logs. **Stories**. The PKG tells *who* the user is. Episodic memory tells *what they've been doing*.

### Schema

```sql
CREATE TABLE episodes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  summary       TEXT NOT NULL,    -- LLM-generated 1-sentence narrative
  start_ts      DATETIME,
  end_ts        DATETIME,
  task_ids      TEXT,             -- JSON array of task_ids in this episode
  key_entities  TEXT,             -- JSON array — projects, files, errors
  outcome       TEXT,             -- 'resolved' | 'abandoned' | 'ongoing'
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Episode Builder Cron — hourly

```typescript
// Cron: every hour — cluster recent tasks into episodes
export async function buildEpisode() {
  const recent = db.prepare(`
    SELECT * FROM tasks 
    WHERE updated_at > datetime('now', '-1 hour')
    AND episode_id IS NULL
  `).all();
  
  if (recent.length < 3) return;
  
  // Cluster by time gaps > 10min and entity overlap
  const clusters = clusterTasks(recent);
  
  for (const cluster of clusters) {
    const summary = await llm.complete({
      system: "Summarize this work session in one sentence. Include the project, what was attempted, and the outcome.",
      messages: [{ role: 'user', content: JSON.stringify(cluster) }],
      task_type: 'fast'
    });
    
    db.prepare(`
      INSERT INTO episodes (summary, start_ts, end_ts, task_ids, key_entities, outcome)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      summary.content,
      cluster[0].created_at,
      cluster[cluster.length-1].updated_at,
      JSON.stringify(cluster.map(t => t.task_id)),
      JSON.stringify(extractEntities(cluster)),
      inferOutcome(cluster)
    );
  }
}
```

**Used by:** The Shadow Loop. Instead of just looking at last 10 events, it can ask: "What was the user working on yesterday?" and inject the most recent 3 episode summaries into the system prompt.

**Build time:** 1 day. v0.2.

---

## 9. 📉 Confidence Decay — Belief Calibration

PKG rows go stale. A user's "active project" from 30 days ago is probably wrong now.

### File: `atrium/src/intelligence/decay.ts`

```typescript
const DECAY_RULES: Record<string, { half_life_days: number; floor: number }> = {
  "active_project":      { half_life_days: 14, floor: 0.1 },
  "preferred_stack":     { half_life_days: 90, floor: 0.5 },
  "primary_language":    { half_life_days: 180, floor: 0.7 },
  "fix_style":           { half_life_days: 30, floor: 0.3 },
  "ignore_event_*":      { half_life_days: 7, floor: 0.0 },  // ignore rules expire faster
};

// Cron: daily at 3am
export async function decayPKG() {
  const rows = db.prepare(`SELECT * FROM user_context`).all();
  
  for (const row of rows) {
    const rule = matchRule(row.key);
    if (!rule) continue;
    
    const days_old = (Date.now() - new Date(row.updated_at).getTime()) / (1000 * 60 * 60 * 24);
    const decay_factor = Math.pow(0.5, days_old / rule.half_life_days);
    const new_confidence = Math.max(rule.floor, row.confidence * decay_factor);
    
    db.prepare(`
      UPDATE user_context SET confidence = ? WHERE key = ?
    `).run(new_confidence, row.key);
    
    // If confidence dropped below 0.3 → schedule a re-confirm via Telegram
    if (new_confidence < 0.3 && row.confidence >= 0.3) {
      scheduleReconfirm(row.key, row.value);
    }
  }
}
```

**Effect:** PKG stays calibrated. Stale beliefs fade. The user gets occasional gentle re-confirms: "Are you still working on the X project? I'll update my context."

**Build time:** 0.5 day. v0.2.

---

## 10. 🔒 Audit Ledger — Tamper-Evident Log

For enterprise mode. Every action is hashed with the previous action's hash. Tampering breaks the chain.

### Schema

```sql
CREATE TABLE audit_ledger (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ts           DATETIME DEFAULT CURRENT_TIMESTAMP,
  actor        TEXT,             -- 'user' | 'council' | 'shadow_loop' | 'cron'
  action       TEXT NOT NULL,
  task_id      TEXT,
  payload      TEXT,
  prev_hash    TEXT,
  this_hash    TEXT NOT NULL
);
```

```typescript
import { createHash } from 'crypto';

export function appendLedger(entry: AuditEntry) {
  const last = db.prepare(`
    SELECT this_hash FROM audit_ledger ORDER BY id DESC LIMIT 1
  `).get();
  
  const prev_hash = last?.this_hash ?? 'GENESIS';
  
  const payload_str = JSON.stringify(entry.payload);
  const this_hash = createHash('sha256')
    .update(`${prev_hash}|${entry.ts}|${entry.actor}|${entry.action}|${entry.task_id}|${payload_str}`)
    .digest('hex');
  
  db.prepare(`
    INSERT INTO audit_ledger (ts, actor, action, task_id, payload, prev_hash, this_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(entry.ts, entry.actor, entry.action, entry.task_id, payload_str, prev_hash, this_hash);
}

export function verifyLedger(): { valid: boolean; broken_at?: number } {
  const all = db.prepare(`SELECT * FROM audit_ledger ORDER BY id ASC`).all();
  let expected_prev = 'GENESIS';
  
  for (const row of all) {
    if (row.prev_hash !== expected_prev) {
      return { valid: false, broken_at: row.id };
    }
    const computed = createHash('sha256')
      .update(`${row.prev_hash}|${row.ts}|${row.actor}|${row.action}|${row.task_id}|${row.payload}`)
      .digest('hex');
    if (computed !== row.this_hash) {
      return { valid: false, broken_at: row.id };
    }
    expected_prev = row.this_hash;
  }
  return { valid: true };
}
```

**Build time:** 0.5 day. v0.2 — but consider including for May 20 if enterprise demo angle matters.

---

## 11. ✨ The Surprise Layer — From Reactive to Magical

This section is the difference between an agent that helps and an agent that **delights**. Surprise is a measurable cognitive event: the user's prediction of what Parix will do is violated in a positive direction.

### The Three Tiers of Surprise

| Tier | Description | Example | What It Needs |
|---|---|---|---|
| **1 — "Oh, it noticed"** | Reactive, sensor-triggered | Terminal error → Telegram DM | v1.0 has this |
| **2 — "Oh, it remembered"** | Recall from past context | "Last time on this project, you were stuck on JWT" | Episodic Memory + Recall Daemon |
| **3 — "How did it know?"** | Multi-signal inference of unstated need | "You've been on this 2h, laptop's at 15%, here are the SO answers consolidated" | Context Fusion + Silent Intent + Recall + Generosity |

**v1.0 ships Tier 1 fully and light Tier 2. Tier 3 emerges around week 3 of usage** because it needs accumulated data. The plan must set this expectation.

---

### 11.1 Context Fusion — Multi-Signal Correlation

The Council processes events one at a time. Surprise requires **correlating across signals simultaneously**: window title + clipboard + browser tabs + battery + time of day + git status + recent commits = one inferred situation.

#### File: `atrium/src/intelligence/context-fusion.ts`

```typescript
interface Situation {
  id: string;
  ts: number;
  signals: {
    active_window?: string;
    clipboard_summary?: string;     // hashed/summarised, never raw
    open_files?: string[];
    browser_tab_topics?: string[];  // topic clusters, not URLs
    battery_pct?: number;
    time_bucket?: 'morning' | 'afternoon' | 'evening' | 'late_night';
    git_branch?: string;
    git_dirty?: boolean;
    last_commit_age_min?: number;
    idle_min?: number;
    recent_event_types?: string[];
  };
  inferred: string;       // 1-sentence LLM summary of "what's happening"
  confidence: number;
  user_state?: 'flow' | 'stuck' | 'exploring' | 'idle' | 'ending_session';
}

// Cron: every 30s — fuse current signals into a Situation
export async function fuseContext(): Promise<Situation> {
  const signals = await collectAllSignals();
  
  // Cheap inference first — rule-based user_state
  const state = inferUserState(signals);
  
  // Only call LLM if state is interesting (stuck/ending_session)
  let inferred = '';
  let confidence = 0.6;
  
  if (state === 'stuck' || state === 'ending_session') {
    const resp = await llm.complete({
      system: "Summarise this user state in one sentence. Identify the implicit task they're working on.",
      messages: [{ role: 'user', content: JSON.stringify(signals) }],
      task_type: 'fast'
    });
    inferred = resp.content;
    confidence = 0.85;
  } else {
    inferred = `User is in ${state} state working on ${signals.active_window}`;
  }
  
  const situation: Situation = {
    id: crypto.randomUUID(),
    ts: Date.now(),
    signals,
    inferred,
    confidence,
    user_state: state
  };
  
  db.prepare(`
    INSERT INTO situations (id, ts, signals, inferred, confidence, user_state)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(situation.id, situation.ts, JSON.stringify(signals), inferred, confidence, state);
  
  return situation;
}
```

#### Schema

```sql
CREATE TABLE situations (
  id          TEXT PRIMARY KEY,
  ts          INTEGER NOT NULL,
  signals     TEXT NOT NULL,         -- JSON
  inferred    TEXT,
  confidence  REAL,
  user_state  TEXT,
  acted_on    INTEGER DEFAULT 0
);
CREATE INDEX idx_situations_ts ON situations(ts DESC);
```

**Key design point:** Situations are the input to the Shadow Loop, **not raw events**. This is the architectural shift that enables surprise.

**Build time:** 1 day.

---

### 11.2 Silent Intent Detectors — Catching Unasked Questions

Most agents act when asked. Surprise comes from acting on what the user **almost asked but didn't**.

#### File: `hands/sensors/silent_intent.py`

```python
class SilentIntentDetector:
    """
    Fires SILENT_INTENT_EVENT when user shows signs of an unspoken need.
    Each detector emits low confidence (~0.5). Fusion of 2+ simultaneous 
    silent intents crosses 0.8 — that's where Tier 3 lives.
    """
    
    def detect_aborted_search(self):
        # User typed in a search bar (browser, IDE, system), then cleared it
        # Signal: focused input → text typed → text deleted → focus lost
        # Implies: had a question, gave up
        pass
    
    def detect_read_without_edit(self):
        # User opened file, scrolled to a function, stayed >30s, didn't edit
        # Implies: trying to understand, not modify
        pass
    
    def detect_research_mode(self):
        # 3+ browser tabs on similar topics open simultaneously
        # No synthesis output (no doc/note created)
        # Implies: gathering, not yet structuring
        pass
    
    def detect_abandoned_commit(self):
        # User opened git commit dialog, typed draft, closed without committing
        # Implies: stuck on what to say or doubting the change
        pass
    
    def detect_repeated_undo(self):
        # 5+ undos in 60s in the same file
        # Implies: experimenting, uncertain, may need a suggestion
        pass
    
    def detect_idle_after_error(self):
        # Terminal error occurred, no user action for >2 min
        # Implies: reading, thinking, possibly stuck
        pass

    def emit(self, intent_type: str, signal_data: dict, confidence: float = 0.5):
        bridge.send({
            "type": "SILENT_INTENT_EVENT",
            "intent_type": intent_type,
            "data": signal_data,
            "confidence": confidence,
            "timestamp": time.time()
        })
```

#### Protocol addition (`shared/protocol.json`)

```json
"SILENT_INTENT_EVENT": {
  "from": "hands",
  "fields": ["intent_type", "data", "confidence", "timestamp"]
}
```

**Privacy boundary:** Silent intent detectors must **only** report the **type** of intent, not raw content. `aborted_search` fires — it does NOT include what the user typed. This is non-negotiable for trust.

**Build time:** 1.5 days for all 6 detectors. Start the 2 easiest (`idle_after_error`, `read_without_edit`) on Day 5 of the blitz.

---

### 11.3 Recall Daemon — The Biggest Missing Piece

The single highest-impact surprise primitive. Every 60s, scans recent activity, searches Episodic Memory for relevant past episodes, surfaces matches above a confidence threshold.

#### File: `atrium/src/intelligence/recall-daemon.ts`

```typescript
interface RecallMatch {
  episode_id: number;
  summary: string;
  relevance: number;
  age_days: number;
  entities_matched: string[];
  surface_as: 'aegis_subtle' | 'telegram' | 'ignore';
}

// Cron: every 60s during active session
export async function recallDaemon(): Promise<RecallMatch[]> {
  const currentSituation = await getLatestSituation();
  if (!currentSituation) return [];
  
  const entities = extractEntities(currentSituation);
  // entities = ['project_name', 'file_paths', 'error_signatures', 'people', 'libraries']
  
  if (entities.length === 0) return [];
  
  // Query episodic memory for episodes touching these entities
  const candidates = db.prepare(`
    SELECT * FROM episodes 
    WHERE end_ts < datetime('now', '-2 days')   -- not too recent
    AND end_ts > datetime('now', '-90 days')    -- not too old
    AND key_entities IS NOT NULL
  `).all();
  
  const matches: RecallMatch[] = [];
  
  for (const ep of candidates) {
    const epEntities = JSON.parse(ep.key_entities);
    const overlap = entities.filter(e => epEntities.includes(e)).length;
    if (overlap === 0) continue;
    
    const relevance = (overlap / entities.length) * 
                      (ep.outcome === 'resolved' ? 1.0 : 0.8);
    
    if (relevance < 0.5) continue;
    
    // Avoid surfacing the same memory twice in 24h
    const alreadySurfaced = db.prepare(`
      SELECT 1 FROM recall_log WHERE episode_id = ? AND ts > datetime('now', '-1 day')
    `).get(ep.id);
    if (alreadySurfaced) continue;
    
    matches.push({
      episode_id: ep.id,
      summary: ep.summary,
      relevance,
      age_days: daysSince(ep.end_ts),
      entities_matched: entities.filter(e => epEntities.includes(e)),
      surface_as: relevance > 0.85 ? 'aegis_subtle' : 'ignore'
    });
  }
  
  // Surface top match only (one surprise at a time)
  const top = matches.sort((a, b) => b.relevance - a.relevance)[0];
  if (top && top.surface_as !== 'ignore') {
    await surfaceRecall(top);
    db.prepare(`INSERT INTO recall_log (episode_id, ts) VALUES (?, ?)`)
      .run(top.episode_id, Date.now());
  }
  
  return matches;
}

async function surfaceRecall(match: RecallMatch) {
  // ALWAYS check generosity budget first
  if (!generosityGovernor.allowSurprise('recall')) return;
  
  // Subtle by default — Aegis notification, not Telegram interrupt
  aegis.notify({
    type: 'recall',
    text: `From ${match.age_days} days ago: ${match.summary}`,
    actions: ['Open', 'Dismiss']
  });
}
```

#### Schema

```sql
CREATE TABLE recall_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  episode_id  INTEGER NOT NULL,
  ts          INTEGER NOT NULL,
  user_action TEXT       -- 'opened' | 'dismissed' | 'ignored'
);
```

**Why this is the biggest win:** It produces surprise the moment Episodic Memory has ≥10 episodes. That's ~3 days of active use. Tier 2 surprise becomes routine quickly.

**Build time:** 1 day. Depends on Episodic Memory existing first.

---

### 11.4 Generosity Governor — Preventing Creepiness

Surprise is fragile. Wrong surprise = creepy. Right surprise = magic. Without a cap, Parix becomes a clingy assistant that interrupts every 15 minutes.

#### File: `atrium/src/intelligence/generosity.ts`

```typescript
interface GenerosityConfig {
  daily_surprise_budget: number;     // Default 3
  min_confidence: number;            // 0.85 minimum
  cooldown_minutes: number;          // No two surprises within 90 min
  require_reversibility: number;     // Surprises must be ≥0.7 reversibility
  per_type_caps: Record<string, number>;  // recall: 2/day, proactive_fix: 1/day
}

// Personal mode: the agent is aggressive — it's here to outperform, not to be polite
const PERSONAL_CONFIG: GenerosityConfig = {
  daily_surprise_budget: 20,         // Act as often as needed
  min_confidence: 0.7,               // Lower bar — a senior employee acts on 70% confidence
  cooldown_minutes: 10,              // 10 min between proactive surfaces, not 90
  require_reversibility: 0.0,        // No reversibility gate on information/suggestions
  per_type_caps: {
    recall: 10,                      // Surface past context freely
    proactive_fix: 5,                // Fix things without asking — that's the job
    inferred_need: 5,                // Anticipate freely
    consolidation: 3
  }
};

// Enterprise mode: more conservative — multiple users, shared context, trust is earned
const ENTERPRISE_CONFIG: GenerosityConfig = {
  daily_surprise_budget: 5,
  min_confidence: 0.85,
  cooldown_minutes: 60,
  require_reversibility: 0.7,
  per_type_caps: {
    recall: 3,
    proactive_fix: 1,
    inferred_need: 2,
    consolidation: 1
  }
};

const CONFIG = config.get('mode') === 'enterprise' ? ENTERPRISE_CONFIG : PERSONAL_CONFIG;

export class GenerosityGovernor {
  allowSurprise(type: string, confidence: number = 1.0, reversibility: number = 1.0): boolean {
    // Hard checks
    if (confidence < CONFIG.min_confidence) return false;
    if (reversibility < CONFIG.require_reversibility) return false;
    
    // Daily cap
    const today = db.prepare(`
      SELECT COUNT(*) AS n FROM surprises WHERE ts > datetime('now', 'start of day')
    `).get() as { n: number };
    if (today.n >= CONFIG.daily_surprise_budget) return false;
    
    // Per-type cap
    const typeCount = db.prepare(`
      SELECT COUNT(*) AS n FROM surprises 
      WHERE type = ? AND ts > datetime('now', 'start of day')
    `).get(type) as { n: number };
    if (typeCount.n >= (CONFIG.per_type_caps[type] ?? 1)) return false;
    
    // Cooldown
    const last = db.prepare(`
      SELECT ts FROM surprises ORDER BY ts DESC LIMIT 1
    `).get() as { ts: number } | undefined;
    if (last) {
      const minsSince = (Date.now() - last.ts) / 60000;
      if (minsSince < CONFIG.cooldown_minutes) return false;
    }
    
    return true;
  }
  
  record(type: string, payload: any) {
    db.prepare(`
      INSERT INTO surprises (type, payload, ts) VALUES (?, ?, ?)
    `).run(type, JSON.stringify(payload), Date.now());
  }
  
  // Self-tuning: if user dismisses 50%+ of surprises in 7d, reduce budget
  async tune() {
    const stats = db.prepare(`
      SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN user_action = 'dismissed' THEN 1 ELSE 0 END) AS dismissed
      FROM surprises WHERE ts > datetime('now', '-7 days')
    `).get() as { total: number; dismissed: number };
    
    if (stats.total < 5) return;
    const dismissRate = stats.dismissed / stats.total;
    
    if (dismissRate > 0.5) {
      CONFIG.daily_surprise_budget = Math.max(1, CONFIG.daily_surprise_budget - 1);
      CONFIG.min_confidence = Math.min(0.95, CONFIG.min_confidence + 0.03);
      logger.info('Generosity tightened', CONFIG);
    } else if (dismissRate < 0.15 && stats.total > 14) {
      CONFIG.daily_surprise_budget = Math.min(5, CONFIG.daily_surprise_budget + 1);
      logger.info('Generosity loosened', CONFIG);
    }
  }
}
```

#### Schema

```sql
CREATE TABLE surprises (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  type        TEXT NOT NULL,
  payload     TEXT,
  ts          INTEGER NOT NULL,
  user_action TEXT,           -- 'accepted' | 'dismissed' | 'ignored' | 'modified'
  actioned_at INTEGER
);
```

**Personal mode:** Twenty correct actions a day is a great employee. The agent acts freely — the self-tuning feedback loop adapts if the user starts dismissing.

**Enterprise mode:** Conservative. Five surfaces/day max. Earn trust before acting freely.

**Build time:** 0.5 day. **This must ship with v0.1** — without it, the surprise primitives become annoying.

---

### 11.5 Rotating Shadow Prompts — Diverse Inference

The v1.0 Shadow Loop asks one question: "is user stuck?" That's Tier 1.5 at best. To get to Tier 3, rotate through different inference frames.

#### File: `atrium/src/intelligence/shadow-prompts.ts`

```typescript
interface ShadowPrompt {
  id: string;
  question: string;
  trigger_conditions: (situation: Situation) => boolean;
  min_confidence_to_surface: number;
  frequency_minutes: number;
}

const SHADOW_PROMPTS: ShadowPrompt[] = [
  {
    id: 'stuck_detector',
    question: 'Is the user stuck on a specific problem they have not asked about?',
    trigger_conditions: s => s.user_state === 'stuck',
    min_confidence_to_surface: 0.85,
    frequency_minutes: 5
  },
  {
    id: 'almost_did',
    question: 'What did the user almost do in the last 10 minutes but did not? What was the intent behind that aborted action?',
    trigger_conditions: s => (s.signals.recent_event_types ?? []).includes('SILENT_INTENT_EVENT'),
    min_confidence_to_surface: 0.80,
    frequency_minutes: 10
  },
  {
    id: 'forgotten_context',
    question: 'Based on the current files and project, what past episode is most relevant that the user has likely forgotten?',
    trigger_conditions: s => s.user_state !== 'idle' && episodeCount() >= 10,
    min_confidence_to_surface: 0.85,
    frequency_minutes: 15
  },
  {
    id: 'future_need',
    question: 'What information will the user need in the next 10 minutes that they do not have now? Only respond if highly confident.',
    trigger_conditions: s => s.user_state === 'flow',
    min_confidence_to_surface: 0.90,
    frequency_minutes: 20
  },
  {
    id: 'pattern_emerging',
    question: 'Across the user activity in the last 24 hours, what pattern points to an emerging need or recurring friction?',
    trigger_conditions: s => true,
    min_confidence_to_surface: 0.88,
    frequency_minutes: 60
  }
];

// Run by Scheduler — picks the highest-priority prompt whose conditions match
export async function runShadowPrompt(): Promise<void> {
  const situation = await getLatestSituation();
  if (!situation) return;
  
  const eligible = SHADOW_PROMPTS.filter(p => {
    if (!p.trigger_conditions(situation)) return false;
    return shouldRunByFrequency(p);
  });
  
  if (eligible.length === 0) return;
  
  // Pick the one with longest interval since last run
  const chosen = eligible.sort((a, b) => 
    lastRunMinutesAgo(b.id) - lastRunMinutesAgo(a.id)
  )[0];
  
  const response = await llm.complete({
    system: buildShadowSystemPrompt(situation),
    messages: [{ role: 'user', content: chosen.question }],
    task_type: 'shadow'
  });
  
  const parsed = parseShadowResponse(response.content);
  
  if (parsed.confidence >= chosen.min_confidence_to_surface) {
    // Check generosity + reversibility before surfacing
    if (generosityGovernor.allowSurprise('inferred_need', parsed.confidence, parsed.reversibility)) {
      await surfaceInsight(parsed);
      generosityGovernor.record('inferred_need', parsed);
    }
  }
  
  recordShadowRun(chosen.id, situation.id, parsed);
}
```

**This replaces the single-prompt Shadow Loop in v1.0.** Build the rotation skeleton on Day 4 with just `stuck_detector` active. Add other prompts in v0.2 once you have enough episode data for them to be useful.

**Build time:** 1 day total. Day-4 minimum viable: `stuck_detector` only — that alone is better than v1.0's static prompt.

---

### 11.6 The Honest Limits of Surprise

Three uncomfortable things to bake into the plan:

**1. Surprise needs data that doesn't exist on Day 1.**
You cannot recall episodes that haven't happened yet. The first 2 weeks of Parix usage produce **zero** Tier 3 surprises by definition. Set this expectation explicitly in the README. The v0.1 demo should *show* the surprise scaffolding (Hatchery shows what signals are monitored, Aegis has a "Surprise Log" tab) — but no one should expect Tier 3 magic at demo time.

**2. Surprise has a creepiness cliff.**
The line between "wow, it noticed" and "wow, it knows too much" is **the user's mental model of what Parix monitors**. If they don't know you read their clipboard, finding out via a surprise is a betrayal, not a delight.

**Required:** In the Hatchery, show a "Surveillance Scope" screen listing every signal Parix watches, with toggles for each. This is non-negotiable. Add as Hatchery Step 4.5.

**3. Surprise compounds with feedback.**
Without feedback (accept/dismiss buttons on every surface), the system can't tune. Every recall and inferred-need surface must have an explicit action — clicking is the training signal.

---

### 11.7 Anti-Pattern: What Surprise Is NOT

To stay disciplined, what doesn't count as surprise:

| ❌ Not surprise | ✅ Real surprise |
|---|---|
| Sending a daily summary | Surfacing yesterday's stuck point when user reopens the project |
| Reminding about a calendar event | Noticing a calendar event conflicts with a deploy script the user just started running |
| Auto-fixing imports | Saying "you debugged this exact error 3 weeks ago — here's what you did" |
| Notifying when a build fails | Predicting the build will fail and warning before user runs it |

The pattern: **surprise = inference, not notification.**

---

## 📊 Updated Phase Integration

| Phase | Day | v1.0 Tasks | v1.1 / v1.2 Additions |
|---|---|---|---|
| 1 — Synapse | 2 | Bridge, ACK, REBOOT_SYNC | + Watchdog (Python thread) + `SILENT_INTENT_EVENT` in protocol |
| 2 — Council | 3–4 | State machine, Gemini | + **Constitution layer (must)** + **Generosity Governor (must)** |
| 3 — Eyes & Ears | 5 | Sensors, watcher | + Log `event_sequences` + 2 silent intent detectors (`idle_after_error`, `read_without_edit`) |
| 4 — Voice | 6 | Telegram, Aegis, Hatchery | + **Reversibility scoring (must)** + Token Governor + **Surveillance Scope screen in Hatchery (must)** + Rotating Shadow Prompts skeleton (with `stuck_detector` only) |
| 5 — Demo | 7 | Polish, stress-test | + Audit ledger if enterprise + Aegis "Surprise Log" tab |

### Deferred to v0.2 (post-May 20)

- Skill Cache (start *logging* on Day 4, build cache on May 21+)
- Self-Optimizer (start *logging* on Day 4, build analysis later)
- Intent Predictor (start *logging sequences* on Day 4)
- Episodic Memory (start *logging tasks* on Day 4)
- Confidence Decay
- Context Fusion (data structure can start Day 4, full LLM inference v0.2)
- Recall Daemon (requires Episodic Memory first — v0.2 week 1)
- Remaining 4 silent intent detectors (`aborted_search`, `research_mode`, `abandoned_commit`, `repeated_undo`)
- Remaining 4 shadow prompts (`almost_did`, `forgotten_context`, `future_need`, `pattern_emerging`)

**The pattern:** Even for deferred modules, **start the data logging now**. When you build them in v0.2, you'll have 1–2 weeks of training data ready.

---

## ⚖️ Honest Tradeoffs

What this adds to the blitz:
- **+2.5 days** of work if you take only the "must" items (Constitution, Watchdog, Reversibility, Token Governor)
- **+5 days** if you take everything

What you cut to fit:
- **Aegis UI polish** → keep functional, skip styling
- **Multi-OS testing** → Windows-only for demo, Linux on May 21
- **Stress test from 20 cycles to 10 cycles** → still proves recovery

### Critical Path for May 20

If you can only add modules from this addendum, do these in order:

1. **Constitution** (0.5d) — prevents catastrophic actions, easy win
2. **Reversibility Scoring** (0.5d) — saves you from a demo-killing accident
3. **Generosity Governor** (0.5d) — ships even if surprise primitives don't, prevents over-eager v1.0 from annoying users
4. **Watchdog state checkpoints** (1d) — makes crash recovery actually impressive
5. **Token Governor** (0.5d) — prevents demo-day rate limit disaster
6. **Surveillance Scope screen in Hatchery** (0.25d) — non-negotiable trust primitive
7. **Rotating Shadow Prompts skeleton with `stuck_detector` only** (0.25d) — replaces v1.0's static prompt

Total: **3.5 days** added. Tighter than v1.1's 2.5 days but still doable.

If you must cut further, drop in this order: 7 → 4 → 5. Never cut 1, 2, 3, or 6.

---

## 🚨 What I Still Disagree With In v1.0

Going back through `agents.md` with the smartness layer in mind, three things still need fixing:

### 1. ~~The Shadow Loop fires every 15 seconds~~ — FIXED in v1.0 spec above (now 60s baseline, 15s on high-confidence)

### 2. ~~The Mock Model confidence breaks the Council~~ — FIXED in v1.0 spec above (now 0.75, with `MOCK_CONFIDENCE` env var)

### 3. ~~No LLM response timeout in Council~~ — FIXED in state machine table above (THINKING → ERROR on >10s, sends "still analyzing...")

---

## 🔍 Is Something Still Missing? — Honest Audit

After three passes through the full plan + this v1.2 addendum, here's what's still genuinely absent. Not all of it should be built — but the gap should be acknowledged:

### Still missing — and you should add these

1. **Onboarding signal-consent screen** — flagged in §11.6 as required for Surveillance Scope, but it needs a concrete spec: a screen showing every sensor with a toggle (window-title, clipboard, browser-tabs, terminal-stdout, git-state, battery). Default-off for clipboard. Without this, surprise becomes betrayal.

2. **A "What Parix knows about you" page in Aegis** — lets the user view and delete PKG rows. GDPR-style data transparency. Critical for trust. 0.5 day.

3. **The Pause Switch** — a global hotkey (Ctrl+Shift+P?) that puts Parix into LISTENING-ONLY mode. No proactive actions, no Telegram, no surfaces. Sensors still record so context isn't lost. 0.25 day. **→ Assigned to Day 7.**

4. **A "Why did you do that?" command** — user can ask Parix to explain any past surface. Returns the situation + episode + confidence that triggered it. 0.5 day. **→ Assigned to Day 7.**

5. **First-run integration test in the Hatchery** — after Step 4.5, run a built-in self-test: fake a SENSOR_EVENT, verify it flows through to configured channel. Surface the exact broken component on failure. 0.5 day. **→ Assigned to Hatchery Step 4.5 (Day 6).**

### Still missing — but defer to v0.2

6. **Cross-device sync** — Parix on laptop vs Parix on desktop currently have separate brains. Eventually: a sync protocol so PKG/Episodes/Skill Cache replicate. Complex (CRDTs or a sync server). Not for the blitz.

7. **Voice output ("The Mouth")** — the v1.0 plan has Telegram + Aegis text. No TTS. For accessibility and ambient delivery (a softer surprise channel). Use ElevenLabs or local Piper TTS. v0.2.

8. **Multi-user / shared workspaces** — only single-user. Enterprise will eventually need this. v0.3+.

9. **Mobile companion app** — Aegis is web. Telegram works on mobile but isn't a full UI. A React Native app for full Aegis-on-mobile. Way out of scope.

10. **The "Why didn't you do that?" inverse command** — user can ask why Parix DIDN'T surface something they expected. Requires logging all near-misses (situations where confidence was below threshold). Big feature, big payoff for trust. v0.2.

### Deliberately NOT adding — these are traps

- **A "personality" config** — making Parix friendly/formal/sarcastic. Sounds fun, becomes a maintenance burden. PKG + system prompt is enough.
- **Multi-modal vision interpretation by default** — running a vision model on every screenshot. Expensive, slow, mostly low-value vs sensor signals. Keep vision strictly Council-triggered as v1.0 specifies.
- **Plugin system** — letting users add custom sensors/actions. Premature. Wait until 100+ users ask for it.
- **An LLM-controlled scheduler** — letting the LLM decide when to run shadow loops. The cron schedule plus prompt rotation is more reliable and 100x cheaper.

### The honest verdict

The 4 must-add items (1, 2, 3, 4) total ~1.75 days. Item 5 is another 0.5 day. That's 2.25 more days on top of the v1.2 critical path's 3.5 days. **Total addendum work: ~5.75 days.**

You have 7 days. The math is tight but viable **if and only if** you accept that v0.1 ships with surprise *scaffolding* (Generosity Governor, Surveillance Scope, Pause Switch, Why-command, integration test) — not surprise *experiences* (Tier 3 magic). The magic emerges weeks 2-3 once data accumulates.

That's the honest scope. Don't promise magic on May 20. Promise the **substrate** that produces magic by June.

---

## 📊 Version Capability Matrix

| Capability | v1.0 | v1.1 | v1.2 |
|---|---|---|---|
| Survives crash | ✅ | ✅ + state continuity | ✅ |
| Reliable bridge | ✅ | ✅ | ✅ |
| Multi-model | ✅ | ✅ + auto-route by perf | ✅ |
| Cron jobs | ✅ | ✅ + state-aware shadow | ✅ + rotating prompts |
| Feedback learning | ✅ | ✅ + cached solutions | ✅ + generosity self-tuning |
| Safety guardrails | ⚠️ partial | ✅ Constitution + Reversibility | ✅ + Generosity governor |
| Predictive | ❌ | ✅ Intent predictor (v0.2) | ✅ |
| Narrative memory | ❌ | ✅ Episodic memory (v0.2) | ✅ |
| Belief calibration | ❌ | ✅ Confidence decay (v0.2) | ✅ |
| Audit-ready | ❌ | ✅ Tamper-evident ledger | ✅ |
| Self-improving | ❌ | ✅ Self-optimizer | ✅ |
| Tier 1 surprise (notices) | ✅ | ✅ | ✅ |
| Tier 2 surprise (remembers) | ❌ | ⚠️ partial | ✅ Recall Daemon |
| Tier 3 surprise (infers unstated need) | ❌ | ❌ | ✅ Context Fusion + Silent Intent |
| Creepiness protection | ❌ | ❌ | ✅ Generosity + Surveillance Scope |

**Verdict:** 
- v1.0 = a reliable agent
- v1.1 = an agent that gets smarter on its own
- v1.2 = an agent that occasionally feels magical, without becoming creepy

Confidence Rating: **8.5/10**. The 1.5 lost points: (1) Tier 3 surprise won't manifest until ~week 3 of usage when episode data accumulates — the demo will show scaffolding, not magic. (2) The silent intent detectors are the most fragile pieces and likely to need real-world tuning. Build the scaffolding, ship the governor, let the magic emerge.

Build it.