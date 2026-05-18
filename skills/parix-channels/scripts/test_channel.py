"""Quick channel adapter connectivity test.

Usage: python test_channel.py [channel_id]
Default: tests desktop notification channel.
"""

import json
import os
import sys
from pathlib import Path

REGISTRY_PATH = Path(__file__).resolve().parents[3] / "shared" / "channels.registry.json"

CHANNEL_ENV_KEYS = {
    "telegram": "TELEGRAM_BOT_TOKEN",
    "discord": "DISCORD_BOT_TOKEN",
    "slack": "SLACK_BOT_TOKEN",
    "whatsapp": "WHATSAPP_ACCESS_TOKEN",
    "teams": "TEAMS_WEBHOOK_URL",
    "google-chat": "GOOGLE_CHAT_WEBHOOK_URL",
    "webhook": "PARIX_WEBHOOK_URL",
}


def check_channel(channel_id: str) -> dict:
    result = {"channel": channel_id, "available": False, "reason": ""}

    if channel_id == "desktop":
        result["available"] = True
        result["reason"] = "desktop notifications always available"
        return result

    env_key = CHANNEL_ENV_KEYS.get(channel_id)
    if not env_key:
        result["reason"] = f"unknown channel: {channel_id}"
        return result

    if os.environ.get(env_key):
        result["available"] = True
        result["reason"] = f"{env_key} is set"
    else:
        result["reason"] = f"{env_key} not set in environment"

    return result


if __name__ == "__main__":
    channel = sys.argv[1] if len(sys.argv) > 1 else "desktop"
    report = check_channel(channel)
    print(json.dumps(report, indent=2))
