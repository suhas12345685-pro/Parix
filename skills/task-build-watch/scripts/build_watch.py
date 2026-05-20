#!/usr/bin/env python3
"""Run one iteration of a build/test command and report structured pass/fail.

Input stdin JSON:
    {"command": ["npm","run","build"], "cwd": ".", "timeoutSeconds": 120}

Output stdout JSON:
    {"success": false, "exitCode": 1, "durationMs": 4321,
     "firstErrorLine": "npm ERR! Cannot find module 'foo'",
     "tail": "<last 2KB>",
     "suggestedNextSkill": "task-terminal-error-resolver"}
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import time

DEFAULT_TIMEOUT_SECONDS = 120
TAIL_BYTES = 2048

ERROR_LINE_PATTERNS = [
    re.compile(p, re.IGNORECASE)
    for p in [
        r"^.*\bnpm ERR!",
        r"^.*\berror:",
        r"^.*\bERROR\b",
        r"^.*\bTraceback \(most recent call last\)",
        r"^.*\bFAIL\b",
        r"^.*\bfatal:",
        r"^.*✗",
    ]
]


def find_first_error_line(combined: str) -> str:
    for line in combined.splitlines():
        s = line.strip()
        if not s:
            continue
        if any(p.search(s) for p in ERROR_LINE_PATTERNS):
            return s
    return ""


def run_once(command: list[str], cwd: str | None, timeout: float) -> dict:
    started = time.time()
    try:
        proc = subprocess.run(
            command,
            cwd=cwd or None,
            capture_output=True,
            timeout=timeout,
            shell=False,
            text=True,
            errors="replace",
        )
    except FileNotFoundError as e:
        return {
            "success": False,
            "exitCode": None,
            "durationMs": int((time.time() - started) * 1000),
            "firstErrorLine": str(e),
            "tail": "",
            "suggestedNextSkill": "",
            "error": "command_not_found",
        }
    except subprocess.TimeoutExpired as e:
        partial = ((e.stdout or "") + (e.stderr or ""))[-TAIL_BYTES:]
        return {
            "success": False,
            "exitCode": None,
            "durationMs": int((time.time() - started) * 1000),
            "firstErrorLine": f"Timed out after {timeout}s",
            "tail": partial,
            "suggestedNextSkill": (
                "task-terminal-error-resolver" if partial else ""
            ),
            "error": "timeout",
        }

    combined = (proc.stdout or "") + ("\n" + proc.stderr if proc.stderr else "")
    tail = combined[-TAIL_BYTES:]
    success = proc.returncode == 0
    first = find_first_error_line(combined) if not success else ""

    return {
        "success": success,
        "exitCode": proc.returncode,
        "durationMs": int((time.time() - started) * 1000),
        "firstErrorLine": first,
        "tail": tail,
        "suggestedNextSkill": (
            "task-terminal-error-resolver" if not success and tail else ""
        ),
    }


def main() -> int:
    raw = sys.stdin.read().strip()
    try:
        inputs = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        inputs = {}

    command = inputs.get("command") if isinstance(inputs, dict) else None
    if not isinstance(command, list) or not command:
        err = {
            "success": False,
            "exitCode": None,
            "durationMs": 0,
            "firstErrorLine": "command (argv array) is required",
            "tail": "",
            "suggestedNextSkill": "",
            "error": "missing_command",
        }
        print(json.dumps(err))
        return 1

    # Defensive: refuse a single-string command. shell=False + a string
    # is a foot-gun that silently fails to find the binary.
    if not all(isinstance(c, str) for c in command):
        err = {
            "success": False,
            "exitCode": None,
            "durationMs": 0,
            "firstErrorLine": "command must be a list of strings (argv)",
            "tail": "",
            "suggestedNextSkill": "",
            "error": "bad_command_shape",
        }
        print(json.dumps(err))
        return 1

    cwd = inputs.get("cwd") if isinstance(inputs.get("cwd"), str) else None
    timeout = inputs.get("timeoutSeconds")
    if not isinstance(timeout, (int, float)) or timeout <= 0:
        timeout = DEFAULT_TIMEOUT_SECONDS

    result = run_once(command, cwd, float(timeout))
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
