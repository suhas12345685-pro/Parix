"""Shared-secret token for the synapse WebSocket handshake.

The token is the same secret on both sides — hands (server) and atrium (client).
Resolution order:

1. ``PARIX_SYNAPSE_TOKEN`` env var (primary mechanism for containerized
   deployments where ``~/.parix`` isn't shared).
2. ``~/.parix/synapse-token`` file (primary mechanism for desktop installs).
3. Generate and persist a new 64-char hex token at ``~/.parix/synapse-token``
   on first run (hands only; atrium reads what hands wrote).

The token only matters for *non-loopback* connections — see
``hands/main.py``'s ``connection_handler``. Loopback peers (127.0.0.1, ::1)
bypass the AUTH gate because same-machine same-user trust is already there.
"""

from __future__ import annotations

import logging
import os
import secrets
from pathlib import Path

logger = logging.getLogger(__name__)

ENV_VAR = "PARIX_SYNAPSE_TOKEN"
TOKEN_FILENAME = "synapse-token"
TOKEN_BYTES = 32


def token_path() -> Path:
    return Path.home() / ".parix" / TOKEN_FILENAME


def _read_token_file(path: Path) -> str | None:
    try:
        text = path.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        return None
    except OSError as e:
        logger.warning("Could not read synapse token at %s: %s", path, e)
        return None
    return text or None


def _write_token_file(path: Path, token: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(token + "\n", encoding="utf-8")
    if os.name != "nt":
        try:
            os.chmod(path, 0o600)
        except OSError as e:
            logger.warning("Could not chmod synapse token at %s: %s", path, e)


def load_or_create_token() -> str:
    """Resolve the token at hands startup. Generates+persists if missing.

    Order: env var → token file → generate.
    """
    env = os.environ.get(ENV_VAR, "").strip()
    if env:
        return env

    path = token_path()
    existing = _read_token_file(path)
    if existing:
        return existing

    token = secrets.token_hex(TOKEN_BYTES)
    try:
        _write_token_file(path, token)
        logger.info("Generated new synapse token at %s", path)
    except OSError as e:
        logger.warning(
            "Could not persist synapse token at %s (%s); using ephemeral token",
            path,
            e,
        )
    return token


def load_token() -> str | None:
    """Read the token without generating one. Returns None if not configured."""
    env = os.environ.get(ENV_VAR, "").strip()
    if env:
        return env
    return _read_token_file(token_path())
