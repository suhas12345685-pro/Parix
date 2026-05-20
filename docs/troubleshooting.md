# Troubleshooting

Common problems and what to do about them. If your symptom isn't here, run
`parix onboarding --check` first — it now prints actionable fixes for every
missing dep.

## Install fails

### Windows: "Parix install requires an Administrator PowerShell"

The bootstrap installer runs `deploy\windows\install.ps1`, which needs admin
to register a scheduled task and write to `%LOCALAPPDATA%`. Right-click
PowerShell → **Run as administrator**, then rerun the install command.

### Windows: "Could not read Python version"

Fixed in `install.ps1` as of 2026-05-20. If you see this, you're on an old
copy — re-pull the repo or re-run the one-liner installer.

### Linux: "On Linux, the installer needs either root or 'sudo'"

The Linux deploy script installs AT-SPI2 system packages with `apt-get`/`dnf`.
Run with sudo or install `sudo` first.

### "Node.js 20+ is required (found v18.x)"

Upgrade Node. The platform-specific installer hint in the error message will
match your OS. On Linux, use the NodeSource setup script — distro-packaged
Node is usually too old.

### `npm ci` fails, then `npm install` runs and also fails

You probably have a partial node_modules from a previous attempt. Delete it:

```bash
rm -rf ~/.parix/node_modules ~/.parix/package-lock.json
parix onboarding --reset
```

## Runtime fails

### `parix start` shows `parix-hands: errored`

Most often a missing Python dep. Check the logs:

```
~/.parix/logs/  (Linux/macOS)
%LOCALAPPDATA%\Parix\logs\  (Windows)
```

Common fixes:
- `pip install -r ~/.parix/hands/requirements.txt`
- Linux: `sudo apt-get install -y at-spi2-core libatspi2.0-dev python3-gi`
- macOS: `pip install pyobjc-framework-ApplicationServices`, then grant
  Accessibility permission in System Settings.

### `parix start` shows `parix-atrium: errored`

Missing build. Rebuild:

```bash
cd ~/.parix
npm run build --workspace=atrium
parix stop && parix start
```

### `parix start` shows `parix-aegis: errored` with EADDRINUSE on 3000

Port conflict. Stop whatever else is on 3000, or change `aegis_ui` in
`shared/protocol.json` and rebuild.

### Aegis UI shows "Atrium offline"

Atrium isn't reachable on `127.0.0.1:8766`. Check:
- `parix status` shows `parix-atrium: online`.
- `~/.parix/logs/parix-atrium-out.log` — last few lines.
- If atrium keeps crashing, run it in the foreground for a clearer error:
  `cd ~/.parix/atrium && node dist/index.js`.

## Onboarding fails

### TUI exits immediately with "TUI wizard not yet implemented"

The TUI requires `tui.js` to be built. Re-run the installer or:

```bash
cd ~/.parix && npm run build --workspace=hatchery
```

### Web onboarding says "Port 3000 is already in use"

Something else is using port 3000 (often a previous Aegis dev server). Stop
it, then `parix onboarding --web` again.

### `parix onboarding --check` says everything is fine but `parix start` still fails

Open an issue with the output of:

```bash
parix onboarding --check > parix-check.txt
parix status >> parix-check.txt
tail -n 200 ~/.parix/logs/*.log >> parix-check.txt
```

Attach `parix-check.txt` to your bug report. See [filing-bugs.md](filing-bugs.md).

## Performance

### Atrium is slow / timing out on LLM calls

The router falls through providers in priority order. Slow first-fallback
masks the real problem. Look at `~/.parix/data/memory.db`:

```sql
SELECT provider, model, AVG(latency_ms), COUNT(*)
FROM model_performance
WHERE ts > datetime('now', '-1 hour')
GROUP BY provider, model;
```

If your primary is consistently slow, switch in `profile.json` or de-prioritize
it.

### Hands accessibility snapshots aren't updating

Look at `accessibility_snapshots` in `memory.db`:

```sql
SELECT focused_app, backend_used, ts
FROM accessibility_snapshots
ORDER BY ts DESC LIMIT 5;
```

If `backend_used` is empty or rows are stale, the OS accessibility API isn't
returning data — usually a permission issue on macOS, or AT-SPI2 not enabled
on Linux. See [boot-order.md](boot-order.md) and `docs/accessibility-plan.md`.

## Uninstall

- **Windows:** `deploy\windows\uninstall.ps1`
- **macOS/Linux:** `deploy/macos/uninstall.sh` or `deploy/linux/uninstall.sh`

These remove `%LOCALAPPDATA%\Parix` / `~/.parix`, the scheduled task /
systemd service, and the PATH entry. They do **not** touch your `.env`
secrets — back those up if you want to keep your API keys.
