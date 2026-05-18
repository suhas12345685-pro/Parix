from __future__ import annotations

import asyncio
import time
from typing import Any

try:
    import pyatspi
except ImportError:
    try:
        from gi.repository import Atspi as pyatspi
    except ImportError as exc:
        raise ImportError("pyatspi or gi.repository.Atspi is required for Linux accessibility") from exc

from .types import AccessibilitySnapshot, UIElement


class LinuxBackend:
    async def get_tree(self) -> AccessibilitySnapshot:
        return await asyncio.to_thread(self._get_tree_sync)

    def _get_tree_sync(self) -> AccessibilitySnapshot:
        desktop = pyatspi.Registry.getDesktop(0)
        focused = _find_focused(desktop)
        app = focused.getApplication() if focused and hasattr(focused, "getApplication") else _first_child(desktop)
        root_ref = app or focused or desktop
        root = self._walk(root_ref)
        return AccessibilitySnapshot(
            timestamp=time.time(),
            platform="linux",
            backend_used="atspi",
            focused_app=str(getattr(root_ref, "name", "") or "unknown"),
            focused_element=self._walk(focused) if focused else None,
            tree=root,
            raw_text=None,
            confidence=0.85,
        )

    def _walk(self, element: Any, depth: int = 0, max_depth: int = 8) -> UIElement:
        if element is None or depth >= max_depth:
            return UIElement("truncated", "...", None, set(), None, [], "accessibility")

        children = [
            self._walk(child, depth + 1, max_depth)
            for child in (
                _child_at_index(element, index)
                for index in range(min(_child_count(element), 50))
            )
            if child is not None
        ]
        return UIElement(
            role=_role_name(element),
            name=str(getattr(element, "name", "") or ""),
            value=_text_value(element),
            state=_states(element),
            bounds=_bounds(element),
            children=children,
            source="accessibility",
        )


def _find_focused(desktop: Any) -> Any | None:
    try:
        return pyatspi.findFocusedObject(desktop)
    except Exception:
        return None


def _first_child(element: Any) -> Any | None:
    if not _child_count(element):
        return None
    return _child_at_index(element, 0)


def _child_at_index(element: Any, index: int) -> Any | None:
    getter = getattr(element, "get_child_at_index", None)
    if getter is not None:
        try:
            return getter(index)
        except Exception:
            return None

    try:
        return element[index]
    except Exception:
        return None


def _child_count(element: Any) -> int:
    try:
        return int(getattr(element, "childCount", 0))
    except Exception:
        return 0


def _role_name(element: Any) -> str:
    try:
        return str(element.getRoleName())
    except Exception:
        return "element"


def _text_value(element: Any) -> str | None:
    try:
        text = element.queryText()
        return str(text.getText(0, -1))
    except Exception:
        return None


def _states(element: Any) -> set[str]:
    states: set[str] = set()
    try:
        state_set = element.getState()
        for state_name in ["focused", "enabled", "selected", "expanded", "visible"]:
            attr = f"STATE_{state_name.upper()}"
            state = getattr(pyatspi, attr, None)
            if state is not None and state_set.contains(state):
                states.add(state_name)
    except Exception:
        pass
    return states


def _bounds(element: Any) -> tuple[int, int, int, int] | None:
    try:
        component = element.queryComponent()
        x, y, width, height = component.getExtents(0)
        return (int(x), int(y), int(width), int(height))
    except Exception:
        return None
