---
name: parix-channels
description: Parix Skill - Channel Adapters
---

# Parix Skill - Channel Adapters

> Use when adding notification channels, modifying the channel router, or working on user-facing message delivery.

## Architecture

Council decides to notify -> ChannelRouter picks the best available channel -> adapter delivers message.

## Registry Contract

The canonical channel catalog lives in `shared/channels.registry.json`.

Each channel entry defines:
- `id`, `name`, and `tier`
- install source: `builtin`, `bundled_plugin`, `downloadable`, `external_plugin`, `external_bridge`, `external_binary`, or `separate_plugin`
- transport type
- supported surfaces (`dm`, `group`, `workspace_channel`, `web`, etc.)
- supported modes (`personal`, `enterprise`)
- required env keys
- capabilities and operational notes

Hatchery should render channel selection from this registry instead of hardcoding channel names.

## Notification Interface

Runtime adapters must register with `registerChannel()` from `atrium/src/intelligence/notify.ts`.

```typescript
import { registerChannel } from '../intelligence/notify.js';

registerChannel({
  id: 'telegram',
  name: 'Telegram',
  tier: 'A',
  async send(payload) {
    return true;
  },
});
```

## Notification Payload

```typescript
{
  title: string;
  body: string;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  taskId?: string;
  actions?: Array<{ label: string; value: string }>;
}
```

## Channel Set

Always available: Desktop, Aegis, Webhook, WebChat.

Personal-heavy: Telegram, WhatsApp, Signal, Discord, iMessage, LINE, Zalo, Zalo Personal, WeChat, QQ Bot, Nostr, Tlon, Twitch, Yuanbao.

Enterprise-heavy: Slack, Microsoft Teams, Google Chat, Mattermost, Feishu/Lark, Nextcloud Talk, Synology Chat, IRC, Voice Call.

## Router Priority

1. Check adapter availability: API key set, service reachable, local bridge present, or QR/session paired.
2. Try the user-configured priority order from `profile.json`.
3. Prefer rich Tier A channels for confirmation actions.
4. Fall back to Tier B webhook/keyword channels.
5. Desktop notifications are the last local fallback.

## Adding a Channel

1. Create the runtime adapter in `atrium/src/channels/`.
2. Register it through `registerChannel()`.
3. Add metadata to `shared/channels.registry.json`.
4. Add env vars to `.env.example` and `shared/secrets.example.json`.
5. Add secret collection/reset handling in `hatchery/src/config-writer.ts`.
6. Add tests for send success/failure and missing config.

## Key Files

| File | Purpose |
|------|---------|
| `shared/channels.registry.json` | Full channel catalog |
| `shared/secrets.example.json` | Machine-readable secret key template |
| `.env.example` | Human-editable environment template |
| `atrium/src/intelligence/notify.ts` | Runtime channel registry |
| `atrium/src/channels/*.ts` | Runtime channel adapters |
| `hatchery/src/config-writer.ts` | Secret persistence and reset |
