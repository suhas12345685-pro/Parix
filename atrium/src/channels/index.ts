// Built-in surfaces (always available).
import "./aegis.js";
import "./desktop.js";
import "./telegram.js";
import "./webhook.js";

// Messaging channel adapters. Each registers itself and only activates when its
// credentials are present in the environment, so importing them all is safe —
// unconfigured channels simply stay dormant. This is what makes the full
// OpenClaw-style channel set available; the user enables the ones they want
// during onboarding (Aegis → Channels) and supplies tokens.
import "./adapters/slack.js";
import "./adapters/discord.js";
import "./adapters/whatsapp.js";
import "./adapters/signal.js";
import "./adapters/imessage.js";
import "./adapters/matrix.js";
import "./adapters/teams.js";
import "./adapters/google-chat.js";
import "./adapters/mattermost.js";
import "./adapters/nextcloud.js";
import "./adapters/synology.js";
import "./adapters/irc.js";
import "./adapters/line.js";
import "./adapters/feishu.js";
import "./adapters/nostr.js";
import "./adapters/twitch.js";
import "./adapters/webchat.js";
import "./adapters/wechat.js";
import "./adapters/qq.js";
import "./adapters/zalo.js";
import "./adapters/zalo-personal.js";
import "./adapters/tlon.js";
