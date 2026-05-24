"""Vision backend: OCR fallback when native accessibility is unavailable.

Uses `mss` for screenshots. It asks Atrium's LLM router for OCR first, then
falls back to local `tesseract` when Atrium has no vision-capable provider,
times out, or returns empty text. Capture/OCR errors return empty text rather
than crashing the poller.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any, Awaitable, Callable

from .types import AccessibilitySnapshot, UIElement

logger = logging.getLogger(__name__)

DEFAULT_OCR_PROMPT = (
    "Extract all readable text from this screenshot. Return only the text, "
    "preserving line breaks where useful. If no text is visible, return an "
    "empty string."
)
DEFAULT_MULTIMODAL_TIMEOUT_S = 8.0


class SynapseMultimodalClient:
    """Request/response helper for MULTIMODAL_* messages over an existing WS."""

    def __init__(
        self,
        send_json: Callable[[str], Awaitable[None]],
        *,
        timeout_s: float = DEFAULT_MULTIMODAL_TIMEOUT_S,
    ) -> None:
        self._send_json = send_json
        self._timeout_s = timeout_s
        self._pending: dict[str, asyncio.Future[dict[str, Any]]] = {}

    async def request_multimodal(
        self,
        *,
        prompt: str,
        image_b64: str,
        mime_type: str = "image/png",
    ) -> tuple[str, str | None]:
        request_id = str(uuid.uuid4())
        loop = asyncio.get_running_loop()
        future: asyncio.Future[dict[str, Any]] = loop.create_future()
        self._pending[request_id] = future

        envelope = {
            "type": "MULTIMODAL_REQUEST",
            "request_id": request_id,
            "prompt": prompt,
            "image_b64": image_b64,
            "mime_type": mime_type,
            "timestamp": time.time(),
        }

        try:
            await self._send_json(json.dumps(envelope))
            response = await asyncio.wait_for(future, timeout=self._timeout_s)
        except asyncio.TimeoutError:
            return "", "timeout"
        except Exception as exc:
            return "", str(exc)
        finally:
            self._pending.pop(request_id, None)

        return str(response.get("text") or ""), response.get("error")

    def handle_raw(self, raw: str) -> bool:
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            return False
        return self.handle_message(msg)

    def handle_message(self, msg: dict[str, Any]) -> bool:
        if msg.get("type") != "MULTIMODAL_RESPONSE":
            return False

        request_id = msg.get("request_id")
        future = self._pending.get(request_id)
        if future is not None and not future.done():
            future.set_result(
                {
                    "text": msg.get("text", ""),
                    "error": msg.get("error"),
                }
            )
        return True

    def cancel_pending(self, error: str = "connection_closed") -> None:
        pending = list(self._pending.values())
        self._pending.clear()
        for future in pending:
            if not future.done():
                future.set_result({"text": "", "error": error})


class VisionBackend:
    def __init__(
        self,
        *,
        multimodal_client: SynapseMultimodalClient | None = None,
        prompt: str = DEFAULT_OCR_PROMPT,
    ) -> None:
        self._multimodal_client = multimodal_client
        self._prompt = prompt

    async def capture_and_ocr(self) -> AccessibilitySnapshot:
        image_bytes = await asyncio.to_thread(self._capture_png)
        text = ""
        ocr_source = "none"

        if image_bytes:
            text = await self._multimodal_with_synapse(image_bytes)
            if text:
                ocr_source = "synapse"
            else:
                text = await asyncio.to_thread(self._ocr_with_tesseract, image_bytes)
                if text:
                    ocr_source = "tesseract"

        tree = self._text_to_tree(text)
        return AccessibilitySnapshot(
            timestamp=time.time(),
            platform=_platform_name(),
            backend_used="vision",
            focused_app="unknown",
            focused_element=None,
            tree=tree,
            raw_text=text,
            confidence=_confidence_for(ocr_source, text),
        )

    async def _multimodal_with_synapse(self, image_bytes: bytes) -> str:
        if self._multimodal_client is None:
            return ""

        image_b64 = base64.b64encode(image_bytes).decode("ascii")
        text, error = await self._multimodal_client.request_multimodal(
            prompt=self._prompt,
            image_b64=image_b64,
            mime_type="image/png",
        )
        if error:
            logger.info("Atrium vision multimodal unavailable: %s", error)
            return ""
        return text.strip()

    def _capture_png(self) -> bytes:
        try:
            import mss
            import mss.tools
        except ImportError:
            return b""

        try:
            with tempfile.TemporaryDirectory() as tmp:
                image_path = Path(tmp) / "parix-screen.png"
                with mss.mss() as sct:
                    monitor = sct.monitors[1] if len(sct.monitors) > 1 else sct.monitors[0]
                    screenshot = sct.grab(monitor)
                    mss.tools.to_png(
                        screenshot.rgb,
                        screenshot.size,
                        output=str(image_path),
                    )
                return image_path.read_bytes()
        except Exception as exc:
            logger.warning("Screenshot capture failed: %s", exc)
            return b""

    def _ocr_with_tesseract(self, image_bytes: bytes) -> str:
        with tempfile.TemporaryDirectory() as tmp:
            image_path = Path(tmp) / "parix-screen.png"
            image_path.write_bytes(image_bytes)

            try:
                result = subprocess.run(
                    ["tesseract", str(image_path), "stdout"],
                    check=False,
                    capture_output=True,
                    text=True,
                    timeout=5,
                )
            except (FileNotFoundError, subprocess.TimeoutExpired):
                return ""

            return result.stdout.strip()

    def _text_to_tree(self, text: str) -> UIElement:
        children = [
            UIElement(
                role="text",
                name=line,
                value=line,
                state=set(),
                bounds=None,
                children=[],
                source="vision",
            )
            for line in text.splitlines()
            if line.strip()
        ]
        return UIElement(
            role="root",
            name="screen",
            value=None,
            state=set(),
            bounds=None,
            children=children,
            source="vision",
        )


def _confidence_for(ocr_source: str, text: str) -> float:
    if not text:
        return 0.2
    if ocr_source == "synapse":
        return 0.75
    return 0.6


def _platform_name() -> str:
    if sys.platform == "win32":
        return "windows"
    if sys.platform == "darwin":
        return "macos"
    return "linux"
