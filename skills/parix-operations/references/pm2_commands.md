# PM2 Operations Cheatsheet

## Lifecycle

| Action               | Command                                          |
|----------------------|--------------------------------------------------|
| Start all            | `npm start`                                      |
| Stop all             | `npx pm2 stop all`                               |
| Restart all          | `npx pm2 restart all`                            |
| Restart one          | `npx pm2 restart parix-hands`                    |
| Delete all           | `npx pm2 delete all`                             |
| Save process list    | `npx pm2 save`                                   |

## Monitoring

| Action               | Command                                          |
|----------------------|--------------------------------------------------|
| Status table         | `npx pm2 status`                                 |
| Live logs (all)      | `npx pm2 logs`                                   |
| Recent logs (static) | `npx pm2 logs --nostream --lines 80`             |
| Single service logs  | `npx pm2 logs parix-atrium --nostream --lines 30`|
| Monit (TUI)         | `npx pm2 monit`                                  |

## Service Ports

| Service        | Port | Protocol  |
|----------------|------|-----------|
| Hands Synapse  | 8765 | WebSocket |
| Aegis Relay    | 8766 | WebSocket |
| Aegis UI       | 3000 | HTTP      |

## Health Checks

| Check                 | Command                                           |
|-----------------------|---------------------------------------------------|
| Hatchery probe        | `python hands/hatchery.py --check`                |
| Aegis HTTP            | `curl -s http://localhost:3000`                   |
| Port scan (Windows)   | `netstat -ano \| findstr "8765 8766 3000"`        |

## Stdin IPC (via PM2 attach)

| Command   | Effect                          |
|-----------|---------------------------------|
| `pause`   | Pause Council                   |
| `resume`  | Resume Council                  |
| `status`  | Print state + queue depth       |
| `explain` | Explain last action             |
| `history` | Last 10 audit entries           |
