# Constitution Blocked Commands — Quick Reference

## Always Blocked (require user confirmation)

| Category | Example Patterns | Reason |
|----------|-----------------|--------|
| Broad filesystem delete | `rm -rf /`, `del /s /q C:\` | Irreversible data loss |
| Privilege escalation | `sudo`, `runas`, admin elevation | Unscoped privilege |
| OS power control | `shutdown`, `reboot`, `poweroff` | Service disruption |
| Registry/system delete | `reg delete`, system dir removal | OS corruption |
| Raw disk writes | `dd if=`, format commands | Data destruction |
| Credential reads | `env` dumps, keychain access | Secret exfiltration |
| Force process kill | `kill -9`, `taskkill /F` on system | Service disruption |
| Package publish | `npm publish`, `pip upload` | Public release |
| Git destructive | `git push --force`, `git reset --hard` | History rewrite |
| Cloud destructive | `terraform destroy`, `kubectl delete` | Infra destruction |

## Banned Libraries (never import, never use)

| Library | Reason |
|---|---|
| `pyautogui` | Steals mouse/keyboard focus — breaks on user interaction |
| `pynput` | Global input hooks — conflicts with user input |
| `keyboard` | Global hotkey hooks — unreliable, steals keystrokes |
| `mouse` | Direct mouse control — moves user's cursor |

Use `mss` for screenshots, `ctypes`/pywinauto read-only for window info, Playwright headless for web, `pyvda` virtual desktop for unavoidable GUI.

## Always Allowed (auto-approved)

| Category | Example Commands |
|----------|-----------------|
| Test runners | `npm test`, `pytest`, `tsc` |
| Git read-only | `git status`, `git diff`, `git log` |
| Process listing | `ps`, `tasklist`, `systemctl status` |
| System metrics | Disk, CPU, memory, battery, uptime reads |
| Notifications | Local desktop/channel notifications |

## Reversibility Score Thresholds

| Score | Action |
|-------|--------|
| < 0.3 | Block, require user confirmation |
| 0.3 - 0.7 | Allow with audit trail |
| > 0.7 | Auto-approve |
