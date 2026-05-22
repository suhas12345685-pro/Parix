#!/usr/bin/env python3
"""
Hatchery — Parix first-run onboarding wizard.

Walks the user through:
  1. Platform detection & capability probing
  2. Notification channel setup (desktop / Telegram / webhook)
  3. LLM provider key setup
  4. Accessibility permission check
  5. Generates .env and config.json

Usage:
    python hatchery.py          # interactive wizard
    python hatchery.py --check  # non-interactive health check
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from textwrap import dedent

import importlib.util

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

# Load our platform-detection module. The file is named platforms.py (plural)
# so it doesn't shadow the stdlib `platform` module — earlier versions used
# `platform.py` which broke any third-party lib that does `import platform`.
_platform_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "platforms.py")
_spec = importlib.util.spec_from_file_location("parix_platform", _platform_path)
_platform_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_platform_mod)  # type: ignore
detect_os = _platform_mod.detect_os
detect_arch = _platform_mod.detect_arch
detect_distro = _platform_mod.detect_distro
probe_capability = _platform_mod.probe_capability

PARIX_HOME = Path(os.getenv("PARIX_HOME", Path.home() / ".parix"))
CONFIG_PATH = PARIX_HOME / "config.json"
ENV_PATH = PARIX_HOME / ".env"

BANNER = r"""
  ____            _
 |  _ \ __ _ _ __(_)_  __
 | |_) / _` | '__| \ \/ /
 |  __/ (_| | |  | |>  <
 |_|   \__,_|_|  |_/_/\_\

  First-run setup wizard
"""


def main() -> None:
    if "--check" in sys.argv:
        health_check()
        return

    print(BANNER)
    print(f"  Detected OS:   {detect_os()}")
    print(f"  Architecture:  {detect_arch()}")
    distro = detect_distro()
    if distro:
        print(f"  Distro:        {distro}")
    print()

    config: dict = {}

    # ── Step 1: Platform capabilities ─────────────────────────
    print("═══ Step 1: Checking platform capabilities ═══\n")
    caps = {
        "accessibility": probe_capability("accessibility"),
        "screenshot": probe_capability("screenshot"),
        "clipboard": probe_capability("clipboard"),
        "notifications": probe_capability("notifications"),
        "package_manager": probe_capability("package_manager"),
    }

    for cap, available in caps.items():
        status = "✓" if available else "✗"
        print(f"  [{status}] {cap}")

    config["capabilities"] = caps
    print()

    if not caps["accessibility"]:
        os_name = detect_os()
        print("  ⚠  Accessibility not available.")
        if os_name == "windows":
            print("     Install: pip install pywinauto")
        elif os_name == "macos":
            print("     Install: pip install pyobjc-framework-ApplicationServices")
            print("     Then grant accessibility in System Settings → Privacy → Accessibility")
        elif os_name == "linux":
            print("     Install: sudo apt install python3-gi at-spi2-core  (or equivalent)")
        print()

    # ── Step 2: Notification channels ─────────────────────────
    print("═══ Step 2: Notification channels ═══\n")
    env_vars: dict[str, str] = {}

    if _ask_yn("Enable desktop notifications?", default=True):
        config["notifications_desktop"] = True
        print("  ✓ Desktop notifications enabled\n")

    if _ask_yn("Set up Telegram notifications?", default=False):
        token = _ask("  Telegram bot token: ")
        chat_id = _ask("  Telegram chat ID: ")
        if token and chat_id:
            env_vars["TELEGRAM_BOT_TOKEN"] = token
            env_vars["TELEGRAM_CHAT_ID"] = chat_id
            config["notifications_telegram"] = True
            print("  ✓ Telegram configured\n")
        else:
            print("  ✗ Skipped (missing token or chat ID)\n")

    if _ask_yn("Set up webhook notifications?", default=False):
        url = _ask("  Webhook URL: ")
        if url:
            env_vars["PARIX_WEBHOOK_URL"] = url
            config["notifications_webhook"] = True
            print("  ✓ Webhook configured\n")
        else:
            print("  ✗ Skipped\n")

    # ── Step 3: LLM provider ─────────────────────────────────
    print("═══ Step 3: LLM provider (for v0.2 planning) ═══\n")
    print("  Parix v0.2.0-alpha can route planning through your chosen LLM provider.")
    print("  You can skip this now and configure a provider later.\n")

    providers = [
        ("ANTHROPIC_API_KEY", "Anthropic (Claude)"),
        ("OPENAI_API_KEY", "OpenAI"),
        ("GEMINI_API_KEY", "Google Gemini"),
        ("GROQ_API_KEY", "Groq"),
        ("OLLAMA_BASE_URL", "Ollama (local)"),
    ]

    for env_key, label in providers:
        existing = os.getenv(env_key)
        if existing:
            print(f"  ✓ {label} — already set in environment")
            continue
        if _ask_yn(f"  Configure {label}?", default=False):
            val = _ask(f"    {env_key}: ")
            if val:
                env_vars[env_key] = val
                print(f"    ✓ {label} configured\n")
            else:
                print(f"    ✗ Skipped\n")

    # ── Step 4: Write config ──────────────────────────────────
    print("\n═══ Step 4: Saving configuration ═══\n")

    PARIX_HOME.mkdir(parents=True, exist_ok=True)

    config["os"] = detect_os()
    config["arch"] = detect_arch()
    config["distro"] = detect_distro()
    config["version"] = "0.2.0-alpha"

    with open(CONFIG_PATH, "w") as f:
        json.dump(config, f, indent=2)
    print(f"  ✓ Config saved to {CONFIG_PATH}")

    if env_vars:
        # Merge with existing .env if present
        existing_env = _read_env(ENV_PATH) if ENV_PATH.exists() else {}
        existing_env.update(env_vars)
        _write_env(ENV_PATH, existing_env)
        print(f"  ✓ Environment saved to {ENV_PATH}")
    else:
        print("  ℹ No environment variables to save")

    print(dedent("""
    ═══ Setup complete! ═══

    Start Parix:
      parix          (if installed via deploy script)
      — or —
      cd hands && python main.py   (start Hands)
      cd atrium && npm start       (start Atrium)

    Commands while running:
      pause    — pause the agent
      resume   — resume the agent
      why      — explain the last action
      history  — show recent action history
      status   — show current state
    """))


def health_check() -> None:
    """Non-interactive check: print system status and exit."""
    print(f"OS:           {detect_os()}")
    print(f"Arch:         {detect_arch()}")
    distro = detect_distro()
    if distro:
        print(f"Distro:       {distro}")

    caps = ["accessibility", "screenshot", "clipboard", "notifications", "package_manager"]
    for cap in caps:
        status = "OK" if probe_capability(cap) else "MISSING"
        print(f"{cap:18s} {status}")

    if CONFIG_PATH.exists():
        print(f"\nConfig:       {CONFIG_PATH} (exists)")
    else:
        print(f"\nConfig:       {CONFIG_PATH} (not found — run hatchery.py)")

    if ENV_PATH.exists():
        print(f"Env:          {ENV_PATH} (exists)")
    else:
        print(f"Env:          {ENV_PATH} (not found)")


# ── Helpers ──────────────────────────────────────────────────────────────

def _ask(prompt: str) -> str:
    try:
        return input(prompt).strip()
    except (EOFError, KeyboardInterrupt):
        print()
        return ""


def _ask_yn(prompt: str, default: bool = True) -> bool:
    suffix = " [Y/n] " if default else " [y/N] "
    try:
        answer = input(prompt + suffix).strip().lower()
    except (EOFError, KeyboardInterrupt):
        print()
        return default
    if not answer:
        return default
    return answer in ("y", "yes")


def _read_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    try:
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, val = line.split("=", 1)
                env[key.strip()] = val.strip().strip("'\"")
    except FileNotFoundError:
        pass
    return env


def _write_env(path: Path, env: dict[str, str]) -> None:
    lines = [f"{k}={v}" for k, v in sorted(env.items())]
    path.write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
