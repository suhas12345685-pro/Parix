# Boot order

Parix runs three processes. They are started by `pm2 start ecosystem.config.js`
in this exact order. The order matters: Hands hosts the Synapse server, Atrium
is a Synapse client, and Aegis is a UI client of both.

| # | Process | Owner | Listens on | Depends on |
|---|---|---|---|---|
| 1 | `parix-hands` | Python 3.12+ | Synapse on `8765` | nothing |
| 2 | `parix-atrium` | Node 20+ | Aegis relay on `8766` | Hands Synapse @ `8765` |
| 3 | `parix-aegis` | Node (Vite preview) | UI on `3000` | Atrium relay @ `8766` |

Ports are the canonical source in `shared/protocol.json`; `ecosystem.config.js`
reads them from there.

## Why PM2 doesn't strictly serialize startup

`ecosystem.config.js` does **not** set `wait_ready: true`, so all three apps
launch near-simultaneously. Atrium routinely starts before Hands has bound its
Synapse port — that is expected. The `SynapseClient` in
`atrium/src/synapse/client.ts` has an ACK tracker with exponential backoff and
a `PARALYZED` state for when Hands is genuinely unreachable. It reconnects
automatically once Hands is up.

If you need strict ordering (e.g. for an automated smoke test), use:

```bash
pm2 start ecosystem.config.js --only parix-hands
# wait for /healthz on 8765 to return 200
pm2 start ecosystem.config.js --only parix-atrium
# wait for /healthz on 8766
pm2 start ecosystem.config.js --only parix-aegis
```

## Survives reboot

- **Linux:** `deploy/linux/install.sh` writes
  `~/.config/systemd/user/parix-agent.service` (Type=forking) and runs
  `systemctl --user enable parix-agent.service`. The launcher
  (`~/.parix/bin/parix`) is invoked at login.
- **Windows:** `deploy/windows/install.ps1` registers a Task Scheduler job
  named `ParixAgent` with `New-ScheduledTaskTrigger -AtLogOn`. The job
  invokes `parix.ps1 start`, which delegates to `npx pm2 start
  ecosystem.config.js`.
- **macOS:** TODO — see ROADMAP.md Phase 0. Currently the user must run
  `parix start` manually after login.

## Restart semantics

| Process | `max_restarts` | `restart_delay` | Notes |
|---|---|---|---|
| parix-hands | 10 | 3 s | Python; crashes here usually mean a missing system dep (AT-SPI2, pyobjc). |
| parix-atrium | 10 | 5 s | Node; crashes here usually mean a missing build (`npm run build --workspace=atrium`). |
| parix-aegis | 5 | 3 s | Vite preview; fewer retries because a port conflict is the most common failure and won't fix itself. |

If a process exceeds `max_restarts`, PM2 marks it `errored` and stops trying.
`parix status` (or `pm2 status`) will show the bad state.
