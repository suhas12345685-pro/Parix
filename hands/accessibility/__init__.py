from __future__ import annotations

import logging
import sys
import time
from typing import Protocol

from .fusion import merge
from .types import AccessibilitySnapshot, UIElement
from .vision import VisionBackend

logger = logging.getLogger(__name__)


class AccessibilityBackend(Protocol):
    async def get_tree(self) -> AccessibilitySnapshot:
        ...


class AccessibilityBridge:
    def __init__(self, *, vision: VisionBackend | None = None) -> None:
        self.backend = self._detect_backend()
        self.vision = vision or VisionBackend()

    def _detect_backend(self) -> AccessibilityBackend | None:
        if sys.platform == "win32":
            try:
                from .windows import WindowsBackend

                return WindowsBackend()
            except ImportError:
                return None
        if sys.platform == "darwin":
            try:
                from .macos import MacOSBackend

                return MacOSBackend()
            except ImportError:
                return None
        if sys.platform.startswith("linux"):
            try:
                from .linux import LinuxBackend

                return LinuxBackend()
            except ImportError:
                return None
        return None

    async def snapshot(self, mode: str = "auto") -> AccessibilitySnapshot:
        native_result: AccessibilitySnapshot | None = None
        vision_result: AccessibilitySnapshot | None = None

        if mode in {"auto", "accessibility", "fused"} and self.backend is not None:
            try:
                native_result = await self.backend.get_tree()
            except Exception as exc:
                logger.warning("Accessibility backend failed: %s", exc)

        if mode == "vision" or (mode == "auto" and native_result is None) or mode == "fused":
            vision_result = await self.vision.capture_and_ocr()

        if native_result and vision_result:
            return merge(native_result, vision_result)
        if native_result:
            return native_result
        if vision_result:
            return vision_result
        return _empty_snapshot()

    def is_native_available(self) -> bool:
        return self.backend is not None


def _empty_snapshot() -> AccessibilitySnapshot:
    return AccessibilitySnapshot(
        timestamp=time.time(),
        platform=sys.platform,
        backend_used="none",
        focused_app="unknown",
        focused_element=None,
        tree=UIElement(
            role="root",
            name="",
            value=None,
            state=set(),
            bounds=None,
            children=[],
            source="none",
        ),
        raw_text=None,
        confidence=0.0,
    )
