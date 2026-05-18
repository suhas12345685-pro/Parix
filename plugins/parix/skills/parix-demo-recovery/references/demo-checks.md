# Demo Checks

Fast checks:

- Protocol ports match `8765`, `8766`, and `3000`.
- Hands imports compile.
- Atrium TypeScript builds.
- Atrium Vitest suite passes.

Runtime checks:

- Hands sends `REBOOT_SYNC` on start.
- Atrium responds with `WORLD_STATE_PUSH`.
- A `TASK_REQUEST` gets `TASK_ACK` before the configured timeout.
- Restarting Hands does not leave pending tasks in SQLite.
