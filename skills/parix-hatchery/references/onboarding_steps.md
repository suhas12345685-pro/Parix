# Hatchery Onboarding Quick Reference

## Steps at a Glance

| Step | Name                  | Key Action                              | Failure Mode              |
|------|-----------------------|-----------------------------------------|---------------------------|
| 1    | Platform Capabilities | Probe OS, Python, Node, a11y, clipboard | Missing runtime or a11y   |
| 2    | Notification Channels | Configure Telegram/Discord/Slack/desktop| Invalid token or webhook  |
| 3    | LLM Provider Keys    | Set API keys or local model endpoints   | Invalid key / unreachable |
| 4    | Save Config           | Write .env, validate keys and channels  | Disk permission error     |

## Required Runtimes

| Runtime    | Minimum Version |
|------------|-----------------|
| Python     | 3.12+           |
| Node.js    | 20+             |
| npm        | (bundled)       |
| git        | any             |

## Notification Channel Config Keys

| Channel   | Env Vars Needed                         |
|-----------|-----------------------------------------|
| Telegram  | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`|
| Discord   | `DISCORD_WEBHOOK_URL`                   |
| Slack     | `SLACK_BOT_TOKEN`, `SLACK_CHANNEL`      |
| Desktop   | (none — default fallback)               |

## CLI Flags

| Flag      | Behavior                                |
|-----------|-----------------------------------------|
| (none)    | Run full interactive wizard             |
| `--check` | Non-interactive health probe, exit 0/1  |
