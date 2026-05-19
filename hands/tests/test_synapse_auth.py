"""Tests for the synapse AUTH handshake and bind-policy gate."""

from __future__ import annotations

import asyncio
import importlib
import json
import os
from pathlib import Path

import pytest


@pytest.fixture
def isolated_home(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("USERPROFILE", str(tmp_path))
    monkeypatch.delenv("PARIX_SYNAPSE_TOKEN", raising=False)
    return tmp_path


class FakeWebSocket:
    def __init__(self, incoming: list[str], remote_address=("1.2.3.4", 4242)):
        self._incoming = list(incoming)
        self.sent: list[dict] = []
        self.closed_with: tuple[int, str] | None = None
        self.remote_address = remote_address

    async def recv(self) -> str:
        if not self._incoming:
            # Mimic websockets behavior: hanging recv if nothing left.
            await asyncio.sleep(10)
            raise AssertionError("recv exhausted")
        return self._incoming.pop(0)

    async def send(self, raw: str):
        self.sent.append(json.loads(raw))

    async def close(self, code: int = 1000, reason: str = ""):
        self.closed_with = (code, reason)

    def __aiter__(self):
        async def gen():
            for item in self._incoming:
                yield item

        return gen()


# ---------- token loader ----------


def test_token_env_overrides_file(isolated_home, monkeypatch):
    from hands.auth import token as token_mod

    importlib.reload(token_mod)
    token_dir = isolated_home / ".parix"
    token_dir.mkdir(parents=True)
    (token_dir / "synapse-token").write_text("tok-from-file\n", encoding="utf-8")

    monkeypatch.setenv("PARIX_SYNAPSE_TOKEN", "tok-from-env")
    assert token_mod.load_token() == "tok-from-env"


def test_token_load_or_create_generates_and_persists(isolated_home):
    from hands.auth import token as token_mod

    importlib.reload(token_mod)
    assert token_mod.load_token() is None

    token = token_mod.load_or_create_token()
    assert token and len(token) == 64
    assert (isolated_home / ".parix" / "synapse-token").read_text(
        encoding="utf-8"
    ).strip() == token

    # Subsequent calls return the same token.
    again = token_mod.load_or_create_token()
    assert again == token


# ---------- bind-policy gate ----------


@pytest.fixture
def reload_main(monkeypatch, isolated_home):
    def _reload(host: str, allow_remote: str | None = None):
        monkeypatch.setenv("PARIX_WS_HOST", host)
        if allow_remote is None:
            monkeypatch.delenv("PARIX_ALLOW_REMOTE_SYNAPSE", raising=False)
        else:
            monkeypatch.setenv("PARIX_ALLOW_REMOTE_SYNAPSE", allow_remote)
        from hands import main as hands_main

        importlib.reload(hands_main)
        return hands_main

    return _reload


def test_localhost_bind_allowed_without_opt_in(reload_main):
    hands_main = reload_main("localhost")
    hands_main._enforce_bind_policy()  # must not raise


def test_non_localhost_bind_refused_without_opt_in(reload_main):
    hands_main = reload_main("0.0.0.0")
    with pytest.raises(SystemExit):
        hands_main._enforce_bind_policy()


def test_non_localhost_bind_allowed_with_opt_in(reload_main):
    hands_main = reload_main("0.0.0.0", allow_remote="1")
    hands_main._enforce_bind_policy()  # must not raise


# ---------- AUTH handshake ----------


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro) if False else asyncio.run(
        coro
    )


def test_loopback_peer_skips_auth(reload_main):
    hands_main = reload_main("localhost")
    hands_main.synapse_token = "secret-token"

    ws = FakeWebSocket(incoming=[], remote_address=("127.0.0.1", 9999))
    _run(hands_main.connection_handler(ws))
    # No AUTH handshake initiated.
    assert all(msg.get("type") != hands_main.SYNAPSE_AUTH_OK for msg in ws.sent)
    assert all(msg.get("type") != hands_main.SYNAPSE_AUTH_ERROR for msg in ws.sent)
    assert ws.closed_with is None


def test_non_loopback_peer_rejected_without_auth(reload_main):
    hands_main = reload_main("0.0.0.0", allow_remote="1")
    hands_main.synapse_token = "secret-token"

    ws = FakeWebSocket(
        incoming=[json.dumps({"type": "TASK_REQUEST", "task_id": "x"})],
        remote_address=("10.0.0.5", 4242),
    )
    _run(hands_main.connection_handler(ws))

    assert ws.sent[0]["type"] == hands_main.SYNAPSE_AUTH_ERROR
    assert ws.sent[0]["reason"] == "auth_required"
    assert ws.closed_with is not None and ws.closed_with[0] == 4401


def test_non_loopback_peer_rejected_with_bad_token(reload_main):
    hands_main = reload_main("0.0.0.0", allow_remote="1")
    hands_main.synapse_token = "secret-token"

    ws = FakeWebSocket(
        incoming=[
            json.dumps({"type": "SYNAPSE_AUTH", "token": "wrong-token"}),
        ],
        remote_address=("10.0.0.5", 4242),
    )
    _run(hands_main.connection_handler(ws))

    assert ws.sent[0]["type"] == hands_main.SYNAPSE_AUTH_ERROR
    assert ws.sent[0]["reason"] == "auth_invalid"
    assert ws.closed_with is not None and ws.closed_with[0] == 4401


def test_non_loopback_peer_accepted_with_correct_token(reload_main):
    hands_main = reload_main("0.0.0.0", allow_remote="1")
    hands_main.synapse_token = "secret-token"

    ws = FakeWebSocket(
        incoming=[
            json.dumps({"type": "SYNAPSE_AUTH", "token": "secret-token"}),
        ],
        remote_address=("10.0.0.5", 4242),
    )
    _run(hands_main.connection_handler(ws))

    assert ws.sent[0]["type"] == hands_main.SYNAPSE_AUTH_OK
    assert ws.closed_with is None
