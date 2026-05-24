"""Tests for the screen operator's synapse vision bridge."""

import asyncio
import json

from hands.vision.operator import SynapseMultimodalProvider


def test_vision_complete_correlates_response():
    """vision_complete sends a MULTIMODAL_REQUEST and returns the text that
    arrives on the matching request_id (as main.py's response handler would set)."""
    sent = []
    pending: dict = {}

    async def send_json(raw: str) -> None:
        msg = json.loads(raw)
        sent.append(msg)
        # Simulate Atrium replying: resolve the future the provider registered.
        fut = pending[msg["request_id"]]
        if not fut.done():
            fut.set_result({"text": '{"action":"done","reason":"ok"}', "error": None})

    async def run():
        provider = SynapseMultimodalProvider(send_json, pending)
        return await provider.vision_complete(image_b64="QUJD", prompt="do the thing")

    result = asyncio.run(run())

    assert result == '{"action":"done","reason":"ok"}'
    assert sent[0]["type"] == "MULTIMODAL_REQUEST"
    assert sent[0]["image_b64"] == "QUJD"
    assert "do the thing" in sent[0]["prompt"]
    assert pending == {}  # future cleaned up after completion


def test_vision_complete_returns_empty_on_error():
    pending: dict = {}

    async def send_json(raw: str) -> None:
        msg = json.loads(raw)
        pending[msg["request_id"]].set_result({"text": "", "error": "no_vision_provider"})

    async def run():
        provider = SynapseMultimodalProvider(send_json, pending)
        return await provider.vision_complete(image_b64="x", prompt="p")

    assert asyncio.run(run()) == ""


def test_vision_complete_times_out():
    pending: dict = {}

    async def send_json(raw: str) -> None:
        pass  # never respond

    async def run():
        provider = SynapseMultimodalProvider(send_json, pending, timeout_s=0.05)
        return await provider.vision_complete(image_b64="x", prompt="p")

    assert asyncio.run(run()) == ""
    assert pending == {}
