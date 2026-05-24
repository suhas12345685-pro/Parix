"""Test an LLM provider connection given its env key.

Usage:
    python test_provider.py <provider_id>

Example:
    python test_provider.py anthropic
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request
import urllib.error

PROVIDERS: dict[str, dict] = {
    "gemini":      {"env": "GEMINI_API_KEY",      "url": "https://generativelanguage.googleapis.com"},
    "chatgpt":     {"env": "OPENAI_API_KEY",       "url": "https://api.openai.com/v1/models"},
    "anthropic":   {"env": "ANTHROPIC_API_KEY",     "url": "https://api.anthropic.com/v1/models"},
    "grok":        {"env": "XAI_API_KEY",           "url": "https://api.x.ai/v1/models"},
    "openrouter":  {"env": "OPENROUTER_API_KEY",    "url": "https://openrouter.ai/api/v1/models"},
    "groq":        {"env": "GROQ_API_KEY",          "url": "https://api.groq.com/openai/v1/models"},
    "mistral":     {"env": "MISTRAL_API_KEY",       "url": "https://api.mistral.ai/v1/models"},
    "kimi":        {"env": "MOONSHOT_API_KEY",      "url": "https://api.moonshot.ai/v1/models"},
    "ollama":      {"env": "OLLAMA_BASE_URL",       "url": "http://localhost:11434/api/tags"},
    "lmstudio":    {"env": "LMSTUDIO_BASE_URL",     "url": "http://localhost:1234/v1/models"},
}


def test_provider(provider_id: str) -> dict:
    info = PROVIDERS.get(provider_id)
    if not info:
        return {"provider": provider_id, "status": "unknown", "error": "not in registry"}
    key = os.environ.get(info["env"], "")
    if not key and provider_id != "ollama":
        return {"provider": provider_id, "status": "skip", "error": f"{info['env']} not set"}
    url = key if provider_id == "ollama" and key else info["url"]
    headers = {"Authorization": f"Bearer {key}"} if key and provider_id != "ollama" else {}
    if provider_id == "anthropic":
        headers = {"x-api-key": key, "anthropic-version": "2023-06-01"}
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return {"provider": provider_id, "status": "ok", "http": resp.status}
    except urllib.error.HTTPError as exc:
        return {"provider": provider_id, "status": "error", "http": exc.code}
    except Exception as exc:
        return {"provider": provider_id, "status": "error", "error": str(exc)}


def main() -> None:
    if len(sys.argv) < 2:
        print(f"usage: {sys.argv[0]} <provider_id>")
        print(f"providers: {', '.join(sorted(PROVIDERS))}")
        raise SystemExit(1)
    result = test_provider(sys.argv[1])
    print(json.dumps(result, indent=2))
    raise SystemExit(0 if result["status"] == "ok" else 1)


if __name__ == "__main__":
    main()
