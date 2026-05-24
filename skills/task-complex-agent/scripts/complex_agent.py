#!/usr/bin/env python3
"""Delegate a complex, multi-step task to a local CLI coding agent.

Parix uses this skill to hand a high-level goal to a full agent CLI
(codex / claude / gemini) — those CLIs can read files, run commands, and edit
code autonomously — then returns the agent's final output. This is how Parix
performs real-time complex tasks: it orchestrates, the CLI agent executes.

Input stdin JSON:
    {"goal": "fix the failing tests in ./", "provider": "claude", "cwd": ".",
     "timeoutSeconds": 600}
      provider: optional — "claude" | "openai" | "gemini" (auto-detected if omitted)
      cwd:      optional working directory
      timeoutSeconds: optional, default 600

Output stdout JSON:
    {"success": true, "provider": "claude", "binary": "claude",
     "output": "<final agent text>", "exitCode": 0, "durationMs": 1234,
     "error": null}

Security: the goal is fed via STDIN (never argv/shell — no injection), and
subprocess runs with shell=False. The delegated CLI can modify files/run
commands, so this skill declares reversibility 0.4 + write permissions; the
council's constitution/autonomy gates still apply before it is ever invoked.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import time

DEFAULT_TIMEOUT_SECONDS = 600
ANSI = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]")

# provider id -> (binary, args that run a single prompt non-interactively)
PROVIDER_CLI = {
    "claude": ("claude", ["-p"]),
    "openai": ("codex", ["exec"]),
    "gemini": ("gemini", ["-p"]),
}


def _has(binary: str) -> bool:
    return shutil.which(binary) is not None


def pick_provider(requested: str | None) -> str | None:
    """Honor an explicit, installed provider; otherwise pick the first CLI present."""
    if requested and requested in PROVIDER_CLI and _has(PROVIDER_CLI[requested][0]):
        return requested
    for pid, (binary, _args) in PROVIDER_CLI.items():
        if _has(binary):
            return pid
    return None


def run(goal: str, provider: str, cwd: str | None, timeout: float) -> dict:
    binary, args = PROVIDER_CLI[provider]
    started = time.time()
    env = {**os.environ, "NO_COLOR": "1", "TERM": "dumb", "CI": "1"}
    try:
        proc = subprocess.run(
            [binary, *args],
            input=goal,                # prompt via stdin — never argv/shell
            cwd=cwd or None,
            capture_output=True,
            text=True,
            timeout=timeout,
            shell=False,
            errors="replace",
            env=env,
        )
    except FileNotFoundError:
        return {
            "success": False, "provider": provider, "binary": binary, "output": "",
            "exitCode": None, "durationMs": 0, "error": f"{binary} CLI not found",
        }
    except subprocess.TimeoutExpired:
        return {
            "success": False, "provider": provider, "binary": binary, "output": "",
            "exitCode": None, "durationMs": int((time.time() - started) * 1000),
            "error": f"{binary} timed out after {int(timeout)}s",
        }

    out = ANSI.sub("", proc.stdout or "").strip()
    err = ANSI.sub("", proc.stderr or "").strip()
    ok = proc.returncode == 0
    return {
        "success": ok,
        "provider": provider,
        "binary": binary,
        "output": out or err,
        "exitCode": proc.returncode,
        "durationMs": int((time.time() - started) * 1000),
        "error": None if ok else (err[:500] or f"exit {proc.returncode}"),
    }


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except Exception as exc:  # noqa: BLE001 - report any parse failure cleanly
        print(json.dumps({"success": False, "error": f"bad input json: {exc}"}))
        return

    goal = str(data.get("goal", "")).strip()
    if not goal:
        print(json.dumps({"success": False, "error": "missing required 'goal'"}))
        return

    provider = pick_provider(data.get("provider"))
    if not provider:
        print(json.dumps({
            "success": False,
            "error": "no agent CLI found — install one of: claude, codex, gemini",
        }))
        return

    timeout = float(data.get("timeoutSeconds", DEFAULT_TIMEOUT_SECONDS))
    print(json.dumps(run(goal, provider, data.get("cwd"), timeout)))


if __name__ == "__main__":
    main()
