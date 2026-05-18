# Parix Installer Quick Reference

## One-Line Install Commands

| Platform       | Command                                                      |
|----------------|--------------------------------------------------------------|
| Windows        | `powershell -c "irm https://openclaw.ai/install.ps1 \| iex"`|
| macOS / Linux  | `curl -fsSL https://openclaw.ai/install.sh \| bash`         |

## Deploy Scripts

| Platform | Installer                      | Uninstaller                      |
|----------|--------------------------------|----------------------------------|
| Windows  | `deploy/windows/install.ps1`   | `deploy/windows/uninstall.ps1`   |
| macOS    | `deploy/macos/install.sh`      | `deploy/macos/uninstall.sh`      |
| Linux    | `deploy/linux/install.sh`      | `deploy/linux/uninstall.sh`      |

## Background Service Registration

| Platform | Mechanism            | Config Location                          |
|----------|----------------------|------------------------------------------|
| Windows  | Task Scheduler       | `schtasks` registered task               |
| macOS    | launchd              | `~/Library/LaunchAgents/ai.openclaw.parix.plist` |
| Linux    | systemd user service | `~/.config/systemd/user/parix.service`   |

## Override Env Vars (for testing)

| Variable          | Purpose                        |
|-------------------|--------------------------------|
| `PARIX_REPO_URL`  | Git clone URL override         |
| `PARIX_BRANCH`    | Branch to checkout             |

## Installer Step Summary

1. Detect OS and architecture
2. Verify Node 20+, npm, Python 3.12+, git
3. Select OS skill pack
4. Write `install-context.json`
5. Copy source directories
6. Install Node + Python dependencies
7. Build Atrium, Hatchery, Aegis
8. Create `.env` from `.env.example`
9. Register background startup
10. Start onboarding
