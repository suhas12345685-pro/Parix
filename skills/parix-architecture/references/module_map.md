# Parix Module Map — Quick Reference

| Layer | Directory | Language | Entry Point | Port |
|-------|-----------|----------|-------------|------|
| Atrium | `atrium/` | TypeScript | `atrium/src/index.ts` | WS client to 8765 |
| Hands | `hands/` | Python | `hands/main.py` | WS server 8765 |
| Aegis | `aegis/` | React/TSX | `aegis/src/App.tsx` | HTTP 3000, WS 8766 |
| Hatchery | `hands/hatchery.py` | Python | CLI wizard | N/A |
| Shared | `shared/` | JSON/SQL | N/A | N/A |
| Skills | `skills/` | Markdown | N/A | N/A |
| Deploy | `deploy/` | Shell/PS1 | Per-platform | N/A |

## Process Manager

PM2 via `ecosystem.config.js` manages: `parix-atrium`, `parix-hands`, `parix-aegis`.

## Key Ports

| Port | Service | Protocol |
|------|---------|----------|
| 8765 | Synapse (Hands WS server) | WebSocket |
| 8766 | Aegis WS feed | WebSocket |
| 3000 | Aegis HTTP | HTTP |

## Database

- Engine: sql.js (WASM SQLite)
- File: `data/parix.db`
- Schema: `shared/schema.sql`
