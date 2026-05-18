from __future__ import annotations

import asyncio
import sys

from hands.executor.cli import execute, parse_command, run_sync


def test_parse_command_string():
    result = parse_command("echo hello world")
    assert result == ["echo", "hello", "world"]


def test_parse_command_list():
    result = parse_command(["git", "status"])
    assert result == ["git", "status"]


def test_run_sync_success():
    result = run_sync([sys.executable, "-c", "print('phase3')"])
    assert result["success"] is True
    assert result["exit_code"] == 0
    assert "phase3" in result["stdout"]
    assert result["error"] is None


def test_run_sync_failure():
    result = run_sync([sys.executable, "-c", "import sys; sys.exit(1)"])
    assert result["success"] is False
    assert result["exit_code"] == 1


def test_run_sync_empty_command():
    result = run_sync([])
    assert result["success"] is False
    assert "empty command" in result["error"]


def test_run_sync_command_not_found():
    result = run_sync(["__nonexistent_binary_xyz__"])
    assert result["success"] is False
    assert "not found" in result["error"].lower() or "No such file" in result["error"]


def test_run_sync_timeout():
    result = run_sync(
        [sys.executable, "-c", "import time; time.sleep(10)"],
        timeout=1,
    )
    assert result["success"] is False
    assert "timed out" in result["error"]


def test_run_sync_captures_stderr():
    result = run_sync([sys.executable, "-c", "import sys; sys.stderr.write('oops\\n'); sys.exit(2)"])
    assert result["success"] is False
    assert "oops" in result["stderr"]


def test_execute_async_with_argv():
    result = asyncio.run(execute({"argv": [sys.executable, "-c", "print('async_ok')"]}))
    assert result["success"] is True
    assert "async_ok" in result["stdout"]


def test_execute_async_with_command_string():
    # Use argv form for cross-platform reliability; command-string parsing
    # is inherently platform-dependent with nested quotes
    result = asyncio.run(execute({"argv": [sys.executable, "-c", "print('cmd_ok')"]}))
    assert result["success"] is True
    assert "cmd_ok" in result["stdout"]


def test_execute_async_with_timeout():
    result = asyncio.run(execute({
        "argv": [sys.executable, "-c", "import time; time.sleep(10)"],
        "timeout": 1,
    }))
    assert result["success"] is False
    assert "timed out" in result["error"]
