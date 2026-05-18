# CLI Executor Safety Rules

## Always Blocked (require Council confirmation)

| Pattern | Why |
|---|---|
| `rm -rf /`, `del /s /q C:\` | Broad filesystem destruction |
| `sudo`, `runas` | Privilege escalation |
| `shutdown`, `reboot` | OS power control |
| `format`, `dd if=` | Raw disk writes |
| `git push --force`, `git reset --hard` | Destructive git |
| `npm publish` | Public release |
| `terraform destroy`, `kubectl delete` | Cloud infrastructure |

## Always Allowed (auto-approved)

| Command | Why |
|---|---|
| `npm test`, `pytest`, `tsc` | Test runners |
| `git status`, `git diff`, `git log` | Read-only git |
| `ps`, `tasklist` | Process listing |
| `df`, `free`, `uptime` | System metrics |

## Execution Rules

- `shell=False` always — argv list, never string interpolation
- Default timeout: 30s — configurable per task
- Stderr captured separately — only set as `error` on non-zero exit
- Working directory: configurable via `cwd` parameter
