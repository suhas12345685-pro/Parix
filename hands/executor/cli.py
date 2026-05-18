"""CLI executor — runs shell commands via subprocess with timeout.

NEVER uses shell=True on user-provided input (injection risk).
Returns stdout, stderr, exit code packaged as a TASK_RESULT dict.
"""

from __future__ import annotations

import asyncio
import shlex
import subprocess
import sys
from typing import Any

DEFAULT_TIMEOUT = 30


def parse_command(command: str | list[str]) -> list[str]:
    if isinstance(command, list):
        return [str(part) for part in command]
    return shlex.split(command, posix=sys.platform != "win32")


def run_sync(
    argv: list[str],
    *,
    timeout: int = DEFAULT_TIMEOUT,
    cwd: str | None = None,
) -> dict[str, Any]:
    if not argv:
        return {"success": False, "exit_code": -1, "stdout": "", "stderr": "", "error": "empty command"}

    try:
        completed = subprocess.run(
            argv,
            capture_output=True,
            text=True,
            timeout=timeout,
            shell=False,
            cwd=cwd,
        )
        return {
            "success": completed.returncode == 0,
            "exit_code": completed.returncode,
            "stdout": completed.stdout,
            "stderr": completed.stderr,
            "error": completed.stderr if completed.returncode != 0 else None,
        }
    except subprocess.TimeoutExpired:
        return {"success": False, "exit_code": -1, "stdout": "", "stderr": "", "error": f"command timed out ({timeout}s)"}
    except FileNotFoundError as e:
        return {"success": False, "exit_code": -1, "stdout": "", "stderr": "", "error": f"command not found: {e}"}
    except Exception as e:
        return {"success": False, "exit_code": -1, "stdout": "", "stderr": "", "error": str(e)}


async def run_async(
    argv: list[str],
    *,
    timeout: int = DEFAULT_TIMEOUT,
    cwd: str | None = None,
) -> dict[str, Any]:
    return await asyncio.to_thread(run_sync, argv, timeout=timeout, cwd=cwd)


async def execute(payload: dict[str, Any]) -> dict[str, Any]:
    command = payload.get("argv") or payload.get("command", "")
    argv = parse_command(command)
    timeout = payload.get("timeout", DEFAULT_TIMEOUT)
    cwd = payload.get("cwd")
    return await run_async(argv, timeout=timeout, cwd=cwd)
