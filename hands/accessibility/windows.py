from __future__ import annotations

import asyncio
import time
from typing import Any

try:
    from pywinauto import Desktop
except ImportError as exc:
    raise ImportError("pywinauto is required for Windows accessibility") from exc

from .types import AccessibilitySnapshot, UIElement


class WindowsBackend:
    async def get_tree(self) -> AccessibilitySnapshot:
        return await asyncio.to_thread(self._get_tree_sync)

    def _get_tree_sync(self) -> AccessibilitySnapshot:
        desktop = Desktop(backend="uia")
        window = desktop.top_window()
        root = self._walk(window.wrapper_object())
        return AccessibilitySnapshot(
            timestamp=time.time(),
            platform="windows",
            backend_used="uiautomation",
            focused_app=_safe_call(window.window_text),
            focused_element=root,
            tree=root,
            raw_text=None,
            confidence=0.9,
        )

    def _walk(self, element: Any, depth: int = 0, max_depth: int = 8) -> UIElement:
        if depth >= max_depth:
            return UIElement("truncated", "...", None, set(), None, [], "accessibility")

        children: list[UIElement] = []
        try:
            children = [self._walk(child, depth + 1, max_depth) for child in element.children()]
        except Exception:
            children = []

        rectangle = None
        try:
            rect = element.rectangle()
            rectangle = (rect.left, rect.top, rect.width(), rect.height())
        except Exception:
            rectangle = None

        info = getattr(element, "element_info", None)
        role = str(getattr(info, "control_type", "") or "element")
        name = str(getattr(info, "name", "") or _safe_call(getattr(element, "window_text", None)))
        return UIElement(
            role=role,
            name=name,
            value=_safe_call(getattr(element, "window_text", None)) or None,
            state=self._states(element),
            bounds=rectangle,
            children=children,
            source="accessibility",
        )

    def _states(self, element: Any) -> set[str]:
        states: set[str] = set()
        for attr, state in [("is_enabled", "enabled"), ("has_keyboard_focus", "focused"), ("is_visible", "visible")]:
            value = getattr(element, attr, None)
            try:
                if callable(value) and value():
                    states.add(state)
            except Exception:
                pass
        return states


def _safe_call(fn: Any) -> str:
    if not callable(fn):
        return ""
    try:
        return str(fn() or "")
    except Exception:
        return ""
