# Channel Tier Reference

## Tier A — Rich Action Channels
Full interactive: inline buttons, "Apply Fix" callbacks, message editing.

| Channel | Transport | Surfaces | Env Key |
|---|---|---|---|
| Telegram | Bot API | dm, group | `TELEGRAM_BOT_TOKEN` |
| Discord | Bot / webhook | dm, group, workspace_channel | `DISCORD_BOT_TOKEN` |
| Slack | Events API + Block Kit | dm, workspace_channel | `SLACK_BOT_TOKEN` |
| Teams | Graph API + Adaptive Cards | dm, workspace_channel | `TEAMS_WEBHOOK_URL` |

## Tier B — Keyword / Webhook Channels
Text-only with keyword-triggered actions (reply "yes" to apply).

| Channel | Transport | Env Key |
|---|---|---|
| WhatsApp | Cloud API | `WHATSAPP_ACCESS_TOKEN` |
| Signal | signal-cli bridge | `SIGNAL_CLI_PATH` |
| Matrix | Client-Server API | `MATRIX_HOMESERVER` |
| Google Chat | Cards v2 | `GOOGLE_CHAT_WEBHOOK_URL` |

## Tier C — Passive Notification
Fire-and-forget, no user response capture.

| Channel | Transport | Env Key |
|---|---|---|
| Desktop | OS notification | none (always on) |
| Webhook | HTTP POST | `PARIX_WEBHOOK_URL` |
| Aegis | WebSocket relay | none (always on) |

## Router Priority Order
1. User's preferred channel (from Hatchery config)
2. Highest available tier (A > B > C)
3. Desktop as final fallback (always available)
