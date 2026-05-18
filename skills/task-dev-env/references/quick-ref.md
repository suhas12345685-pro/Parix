# Dev Environment Recovery Quick Reference

## Error Pattern Cheat Sheet

| Error | Likely Cause | Auto-fix? |
|---|---|---|
| `MODULE_NOT_FOUND` | Missing npm dependency | Yes |
| `ModuleNotFoundError` | Missing Python package | Yes |
| `ENOSPC` | Disk full | Yes (cache clean) |
| `EACCES` | Permission issue | Yes (chmod) |
| `EADDRINUSE` | Port conflict | No (notify) |
| `ENOMEM` | Memory exhausted | No (notify) |
| `gyp ERR!` | Missing build tools | No (notify) |
| `EPERM` | File locked (Windows) | No (notify) |

## Package Manager Detection

| File Present | Use Command |
|---|---|
| `pnpm-lock.yaml` | `pnpm install` |
| `yarn.lock` | `yarn install` |
| `bun.lockb` | `bun install` |
| `package-lock.json` | `npm install` |
| `requirements.txt` | `pip install -r requirements.txt` |
| `Pipfile` | `pipenv install` |
| `pyproject.toml` | `pip install -e .` |

## Common Node.js Fixes

```bash
# Clear cache and reinstall
npm cache clean --force
rm -rf node_modules
npm install

# Heap memory issue
export NODE_OPTIONS="--max-old-space-size=4096"

# OpenSSL legacy
export NODE_OPTIONS="--openssl-legacy-provider"
```

## Common Python Fixes

```bash
# Recreate venv
python -m venv .venv --clear
source .venv/bin/activate
pip install -r requirements.txt
```
