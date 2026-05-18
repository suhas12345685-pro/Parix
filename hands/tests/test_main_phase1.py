from __future__ import annotations

import asyncio
import sys

from hands.executor.cli import execute as cli_execute
from hands.protocol import ACK_TIMEOUT_MS


def test_protocol_ack_timeout_matches_phase_one_contract():
    assert ACK_TIMEOUT_MS == 200


def test_execute_cli_runs_argv_without_shell():
    result = asyncio.run(
        cli_execute(
            {"argv": [sys.executable, "-c", "print('hello from phase one')"]}
        )
    )

    assert result["success"] is True
    assert result["stdout"].strip() == "hello from phase one"
    assert result["error"] is None


def test_execute_cli_rejects_empty_command():
    result = asyncio.run(cli_execute({"command": ""}))

    assert result["success"] is False
    assert result["error"] == "empty command"
