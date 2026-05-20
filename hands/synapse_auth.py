"""
Shared Synapse AUTH helpers — used by main.py (server side) and every
sensor / voice module (client side) so all WebSocket peers send the
required AUTH frame before any other message.

The token lives at $PARIX_HOME/synapse-token (default ~/.parix/synapse-token).
Hands generates it on first boot; Atrium reads it via TypeScript. See
docs/security.md for the contract.
"""

from __future__ import annotations

import json
import logging
import os
import secrets
from pathlib import Path
from typing import Any

import websockets

logger = logging.getLogger("hands.synapse_auth")

PARIX_HOME = Path(os.getenv("PARIX_HOME", str(Path.home() / ".parix")))
TOKEN_PATH = PARIX_HOME / "synapse-token"
AUTH_TIMEOUT_S = 5.0


def load_or_create_token() -> str:
    """Read the token, generating it on first call.

    Idempotent. Best-effort 0600 permissions on POSIX (no-op on Windows).
    """
    try:
        if TOKEN_PATH.exists():
            tok = TOKEN_PATH.read_text(encoding="utf-8").strip()
            if tok:
                return tok
    except OSError as e:
        logger.warning("Could not read existing token at %s: %s", TOKEN_PATH, e)

    PARIX_HOME.mkdir(parents=True, exist_ok=True)
    tok = secrets.token_hex(32)
    TOKEN_PATH.write_text(tok, encoding="utf-8")
    try:
        TOKEN_PATH.chmod(0o600)
    except OSError:
        pass
    logger.info("Generated Synapse token at %s", TOKEN_PATH)
    return tok


async def send_auth(ws: Any) -> bool:
    """Send the AUTH frame and wait for AUTH_OK. Returns True on success.

    Sensor / voice client modules call this immediately after `await
    websockets.connect(url)`. If it returns False the caller should close
    the socket and back off — the server has rejected us, retrying without
    fixing the token will just loop.
    """
    import asyncio

    try:
        token = load_or_create_token()
        await ws.send(json.dumps({"type": "AUTH", "token": token}))
        raw = await asyncio.wait_for(ws.recv(), timeout=AUTH_TIMEOUT_S)
    except (
        asyncio.TimeoutError,
        websockets.ConnectionClosed,
        OSError,
        ValueError,
    ):
        return False
    try:
        msg = json.loads(raw)
    except (TypeError, ValueError):
        return False
    return isinstance(msg, dict) and msg.get("type") == "AUTH_OK"
