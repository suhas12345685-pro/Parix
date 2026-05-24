from __future__ import annotations

import asyncio
import base64
import json

from hands import main as hands_main
from hands.accessibility.vision import SynapseMultimodalClient, VisionBackend


class FakeWebSocket:
    def __init__(self) -> None:
        self.sent: list[dict] = []
        self.remote_address = ("test", 0)

    async def send(self, raw: str) -> None:
        self.sent.append(json.loads(raw))


def reset_bridge_state() -> None:
    hands_main.bridge_connection = None
    hands_main.sensor_connections.clear()
    hands_main.sensor_relay_buffer.clear()
    hands_main.multimodal_requesters.clear()


def test_synapse_multimodal_client_resolves_matching_response() -> None:
    sent: list[dict] = []

    async def send_json(raw: str) -> None:
        sent.append(json.loads(raw))

    async def drive() -> tuple[str, str | None]:
        client = SynapseMultimodalClient(send_json, timeout_s=1.0)
        request = asyncio.create_task(
            client.request_multimodal(
                prompt="read text",
                image_b64=base64.b64encode(b"png").decode("ascii"),
            )
        )
        await asyncio.sleep(0)

        assert sent[0]["type"] == "MULTIMODAL_REQUEST"
        assert sent[0]["mime_type"] == "image/png"
        client.handle_message(
            {
                "type": "MULTIMODAL_RESPONSE",
                "request_id": sent[0]["request_id"],
                "text": "Hello screen",
                "error": None,
            }
        )
        return await request

    text, error = asyncio.run(drive())

    assert text == "Hello screen"
    assert error is None


def test_hands_routes_multimodal_round_trip() -> None:
    atrium = FakeWebSocket()
    requester = FakeWebSocket()
    reset_bridge_state()
    hands_main.bridge_connection = atrium

    asyncio.run(
        hands_main.handle_message(
            requester,
            json.dumps(
                {
                    "type": "MULTIMODAL_REQUEST",
                    "request_id": "vision-1",
                    "prompt": "read text",
                    "image_b64": "cG5n",
                    "mime_type": "image/png",
                    "timestamp": 1.0,
                }
            ),
        )
    )

    assert atrium.sent[-1]["type"] == "MULTIMODAL_REQUEST"
    assert atrium.sent[-1]["request_id"] == "vision-1"

    asyncio.run(
        hands_main.handle_message(
            atrium,
            json.dumps(
                {
                    "type": "MULTIMODAL_RESPONSE",
                    "request_id": "vision-1",
                    "text": "Atrium OCR",
                    "error": None,
                    "timestamp": 2.0,
                }
            ),
        )
    )

    assert requester.sent[-1]["type"] == "MULTIMODAL_RESPONSE"
    assert requester.sent[-1]["text"] == "Atrium OCR"
    assert "vision-1" not in hands_main.multimodal_requesters


def test_vision_backend_uses_synapse_text_before_tesseract(monkeypatch) -> None:
    class OcrClient:
        async def request_multimodal(self, **kwargs):
            return "Router text", None

    backend = VisionBackend(multimodal_client=OcrClient())  # type: ignore[arg-type]
    monkeypatch.setattr(backend, "_capture_png", lambda: b"png")
    monkeypatch.setattr(
        backend,
        "_ocr_with_tesseract",
        lambda image_bytes: (_ for _ in ()).throw(AssertionError("fallback used")),
    )

    snapshot = asyncio.run(backend.capture_and_ocr())

    assert snapshot.raw_text == "Router text"
    assert snapshot.confidence == 0.75
    assert snapshot.tree.children[0].name == "Router text"


def test_vision_backend_falls_back_to_tesseract_on_synapse_error(monkeypatch) -> None:
    class OcrClient:
        async def request_multimodal(self, **kwargs):
            return "", "no_vision_capable_provider"

    backend = VisionBackend(multimodal_client=OcrClient())  # type: ignore[arg-type]
    monkeypatch.setattr(backend, "_capture_png", lambda: b"png")
    monkeypatch.setattr(backend, "_ocr_with_tesseract", lambda image_bytes: "Local text")

    snapshot = asyncio.run(backend.capture_and_ocr())

    assert snapshot.raw_text == "Local text"
    assert snapshot.confidence == 0.6
    assert snapshot.tree.children[0].name == "Local text"
