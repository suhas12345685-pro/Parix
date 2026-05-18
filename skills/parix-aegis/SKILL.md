---
name: parix-aegis
description: Parix Skill — Aegis Dashboard
---

# Parix Skill — Aegis Dashboard

> Use when working on the Aegis React monitoring UI or the relay WebSocket server.

## Architecture

```
Atrium ──► Aegis Relay (port 8766) ──► Aegis React UI (port 3000)
              WebSocket server            Vite dev server
```

## Relay Server (`atrium/src/aegis/relay.ts`)

WebSocket server on port 8766 inside the Atrium process. Streams:

| Event Type | Interval | Content |
|------------|----------|---------|
| `HEALTH_SNAPSHOT` | Every 5s | Council state, queue depth, uptime, governor stats, v0.2 stats |
| `STATE_CHANGE` | Real-time | Council state transitions |
| `SENSOR_EVENT` | Real-time | Forwarded sensor events |
| `AUDIT_ENTRY` | Real-time | New audit ledger entries |

Accepts commands from dashboard:

| Command | Effect |
|---------|--------|
| `pause` | Pauses the Council |
| `resume` | Resumes the Council |
| `explain` | Returns explainability chain for last action |
| `flush` | Clears the task queue |

## React UI (`aegis/`)

Vite + React + Tailwind CSS dashboard.

### Pages

| Page | Route | Content |
|------|-------|---------|
| Dashboard | `/` | 8 stat cards (state, queue, uptime, actions, tokens, episodes, situations, surprises) + live event feed |
| Audit Trail | `/audit` | Expandable audit entries with "Why?" button triggering explainability |
| Settings | `/settings` | Pause/resume toggle, queue flush, governor rate limit bars |

### Key Components

| Component | File | Purpose |
|-----------|------|---------|
| `useParixSocket` | `hooks/useParixSocket.ts` | WebSocket hook to port 8766 |
| `Sidebar` | `components/Sidebar.tsx` | Navigation + live state indicator |
| `StatCard` | `components/StatCard.tsx` | Stat display card |
| `EventFeed` | `components/EventFeed.tsx` | Color-coded live event feed |

## Running Aegis

```bash
# Development
cd aegis && npm run dev

# Via PM2 (ecosystem.config.js)
npm start   # starts all 3 services including Aegis
```

## PM2 Configuration

Aegis runs under PM2 using Vite's JS entrypoint (not the Unix shim):
```js
script: path.join(PARIX_HOME, 'node_modules', 'vite', 'bin', 'vite.js')
```

Port: 3000 (default Vite dev server)
