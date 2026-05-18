---
name: parix-install
description: Parix Skill — One-Line Installation & Release
---

# Parix Skill — One-Line Installation & Release

> Use when preparing, testing, or debugging Parix installers and public one-line install commands.

## Public Install Commands

Windows:
```powershell
powershell -c "irm https://openclaw.ai/install.ps1 | iex"
```

macOS / Linux:
```bash
curl -fsSL https://openclaw.ai/install.sh | bash
```

## Bootstrap Contract

- `install.ps1` and `install.sh` are public entrypoints hosted at `openclaw.ai`.
- They clone the Parix repo into a temporary directory, run the platform installer, then clean up.
- Default repo: `https://github.com/openclaw-ai/parix.git`
- Override source during testing:
  - Windows: `$env:PARIX_REPO_URL="https://github.com/<owner>/<repo>.git"; $env:PARIX_BRANCH="feature"`
  - macOS/Linux: `PARIX_REPO_URL=https://github.com/<owner>/<repo>.git PARIX_BRANCH=feature curl -fsSL ... | bash`

## Installer Responsibilities

1. Detect OS and architecture before installation starts.
2. Verify Node.js 20+, npm, Python 3.12+, and git.
3. Select the active OS skill pack:
   - Windows: `skills/os-windows.md`
   - macOS: `skills/os-macos.md`
   - Linux: `skills/os-linux.md`
   - Docker/container: `skills/os-docker.md`
4. Write `$PARIX_HOME/install-context.json` with OS, distro, arch, runtime versions, and active skill paths.
5. Copy `atrium`, `hands`, `aegis`, `hatchery`, `shared`, `skills`, `deploy`, root package files, `ecosystem.config.js`, and `.env.example`.
6. Install Node dependencies with dev dependencies present so TypeScript/Vite builds work.
7. Install Python dependencies from `hands/requirements.txt`.
8. Build Atrium, Hatchery, and Aegis.
9. Create a local `.env` from `.env.example`.
10. Register background startup:
   - Windows: Task Scheduler
   - macOS: launchd
   - Linux: systemd user service
11. Start onboarding; Hatchery and Atrium read `install-context.json` so the correct OS skill is active.

## Deploy Scripts (Platform Installers)

| Platform | Script | Uninstaller |
|----------|--------|-------------|
| Windows | `deploy/windows/install.ps1` | `deploy/windows/uninstall.ps1` |
| macOS | `deploy/macos/install.sh` | `deploy/macos/uninstall.sh` |
| Linux | `deploy/linux/install.sh` | `deploy/linux/uninstall.sh` |

## Release Checklist

- Run `npm run build --workspace=atrium`.
- Run `npm run build --workspace=hatchery`.
- Run `npm run build --workspace=aegis`.
- Run `npm test -- --pool=forks` from `atrium/`.
- Run `pytest -q hands/tests` from repo root.
- Smoke-test `python hands/hatchery.py --check`.
- Test the one-liner against a throwaway branch using `PARIX_REPO_URL` and `PARIX_BRANCH`.

## Hosting Setup

The `openclaw.ai` domain serves static files:
- `https://openclaw.ai/install.ps1` → serves `install.ps1` from repo root
- `https://openclaw.ai/install.sh` → serves `install.sh` from repo root

These can be hosted via GitHub Pages, Cloudflare Pages, or any static CDN pointing at the repo's root `install.ps1` and `install.sh` files.
