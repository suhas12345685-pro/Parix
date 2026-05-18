---
name: task-dev-env
description: Skill — Developer Environment Recovery
---

# Skill — Developer Environment Recovery

> Triggered on `terminal_error` events related to dev tooling: `MODULE_NOT_FOUND`, `ENOSPC`, `EACCES`, build failures, dependency errors.

## Error → Fix Mapping

| Error Pattern | Fix | Reversibility |
|---|---|---:|
| `MODULE_NOT_FOUND` | `npm install` | 1.0 |
| `Cannot find module` | `npm install` | 1.0 |
| `ModuleNotFoundError` (Python) | `pip install -r requirements.txt` | 1.0 |
| `ENOSPC` | `npm cache clean --force` | 0.8 |
| `No space left on device` | Trigger disk cleanup skill | 0.5 |
| `EACCES` / `Permission denied` | `chmod +x <file>` | 0.9 |
| `EADDRINUSE` | Notify (show `lsof` command) | 1.0 |
| `ECONNREFUSED` | Notify (check target service) | 1.0 |
| `ENOMEM` / `JavaScript heap out of memory` | Notify (suggest `--max-old-space-size`) | 1.0 |
| `ERR_OSSL_EVP_UNSUPPORTED` | `export NODE_OPTIONS=--openssl-legacy-provider` | 0.9 |
| `gyp ERR!` | Notify (install build tools) | 1.0 |
| `tsc: error` | Notify (TypeScript errors in output) | 1.0 |
| `EPERM` (Windows) | Notify (close file handles / run as admin) | 1.0 |
| `pip: command not found` | Notify (install pip) | 1.0 |
| `command not found: node` | Notify (install Node.js) | 1.0 |

## Strategy

1. Match error string against known patterns (above table).
2. If match found and fix is a CLI command with reversibility >= 0.7, execute immediately.
3. If fix is a notification, dispatch via the notification channel.
4. If no match, pass to LLM router (if available) for intelligent diagnosis.
5. Record result in skill cache for future reuse.

## Package Manager Detection

Before running `npm install`, check which package manager the project uses:
- `pnpm-lock.yaml` → use `pnpm install`
- `yarn.lock` → use `yarn install`
- `bun.lockb` → use `bun install`
- `package-lock.json` or none → use `npm install`

## Safety

- Never run `sudo npm install` or `npm install -g` without user confirmation
- Never modify `package.json` or `requirements.txt` directly
- Never delete `node_modules` without confirmation (slow to rebuild)
