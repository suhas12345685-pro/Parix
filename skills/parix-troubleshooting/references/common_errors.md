# Troubleshooting Error Reference

## Service Connectivity

| Symptom                           | Likely Cause                    | Fix Command                                    |
|-----------------------------------|---------------------------------|------------------------------------------------|
| Atrium "WebSocket connection failed" | Hands not running / port 8765 blocked | `npx pm2 restart parix-hands`            |
| Hands status "errored" in PM2     | Missing pip deps or port conflict| `pip install -r hands/requirements.txt`        |
| Aegis dashboard blank page        | Vite not running / relay down   | `npx pm2 restart parix-aegis`                  |
| Council stuck in ACTING           | Hands crashed mid-task          | `npx pm2 restart parix-hands parix-atrium`     |

## LLM Issues

| Symptom                           | Likely Cause                    | Fix                                            |
|-----------------------------------|---------------------------------|------------------------------------------------|
| Falls back to rule-based planning | No API keys or budget exhausted | Check `.env` for API keys; check governor stats|
| Ghost/duplicate tasks             | REBOOT_SYNC not received        | Restart both hands + atrium together           |

## Database

| Symptom                | Likely Cause               | Fix                                                |
|------------------------|----------------------------|----------------------------------------------------|
| SQLITE_BUSY errors     | Multiple Atrium instances  | `npx pm2 delete parix-atrium` then restart single  |

## Python / Import

| Symptom                                  | Likely Cause                      | Fix                                    |
|------------------------------------------|-----------------------------------|----------------------------------------|
| `AttributeError: module 'platform'`      | `hands/platform.py` shadows stdlib| Use `sys.platform` instead             |
| `importlib.util` not found               | Wrong import style                | Use `import importlib.util` explicitly |
| Unicode errors on Windows                | stdout not reconfigured to UTF-8  | Reconfigure stdout/stderr before output|

## Log Locations

| Service | Path                                  |
|---------|---------------------------------------|
| Hands   | `~/.pm2/logs/parix-hands-out.log`     |
| Atrium  | `~/.pm2/logs/parix-atrium-out.log`    |
| Aegis   | `~/.pm2/logs/parix-aegis-out.log`     |
