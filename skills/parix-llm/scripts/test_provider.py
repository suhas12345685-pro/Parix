#!/usr/bin/env python3
"""Test LLM provider connectivity by sending a minimal chat request."""

import os
import sys
import json
import urllib.request
import urllib.error

PROVIDERS = {
    "gemini": {
        "env": "GEMINI_API_KEY",
        "url": "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key={key}",
        "body": {"contents": [{"parts": [{"text": "Say hello in one word."}]}]},
    },
    "openai": {
        "env": "OPENAI_API_KEY",
        "url": "https://api.openai.com/v1/chat/completions",
        "headers": {"Authorization": "Bearer {key}"},
        "body": {"model": "gpt-3.5-turbo", "messages": [{"role": "user", "content": "Say hello in one word."}], "max_tokens": 10},
    },
    "groq": {
        "env": "GROQ_API_KEY",
        "url": "https://api.groq.com/openai/v1/chat/completions",
        "headers": {"Authorization": "Bearer {key}"},
        "body": {"model": "llama3-8b-8192", "messages": [{"role": "user", "content": "Say hello in one word."}], "max_tokens": 10},
    },
}


def test_provider(name, spec):
    key = os.environ.get(spec["env"], "")
    if not key:
        return "SKIP", f"${spec['env']} not set"

    url = spec["url"].format(key=key)
    headers = {"Content-Type": "application/json"}
    for k, v in spec.get("headers", {}).items():
        headers[k] = v.format(key=key)

    data = json.dumps(spec["body"]).encode()
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        return "OK", f"HTTP {resp.status}"
    except urllib.error.HTTPError as e:
        return "FAIL", f"HTTP {e.code}"
    except Exception as e:
        return "FAIL", str(e)


def main():
    print("LLM Provider Connectivity Test")
    print("=" * 50)
    for name, spec in PROVIDERS.items():
        status, detail = test_provider(name, spec)
        print(f"  {name:<14} {status:<6} {detail}")

    # Check local providers
    for name, port in [("ollama", 11434), ("lmstudio", 1234)]:
        import socket
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(2)
            up = s.connect_ex(("127.0.0.1", port)) == 0
        status = "OK" if up else "DOWN"
        print(f"  {name:<14} {status:<6} localhost:{port}")


if __name__ == "__main__":
    main()
