from __future__ import annotations

import asyncio
import time
from typing import Any

try:
    import ApplicationServices as AS
except ImportError as exc:
    raise ImportError("pyobjc ApplicationServices is required for macOS accessibility") from exc

from .types import AccessibilitySnapshot, UIElement


class MacOSBackend:
    async def get_tree(self) -> AccessibilitySnapshot:
        return await asyncio.to_thread(self._get_tree_sync)

    def _get_tree_sync(self) -> AccessibilitySnapshot:
        if not _is_process_trusted():
            return _empty_snapshot(confidence=0.1)

        system = AS.AXUIElementCreateSystemWide()
        app = _copy_attr(system, "AXFocusedApplication")
        focused = _copy_attr(system, "AXFocusedUIElement")
        root_ref = app or focused or system
        root = self._walk(root_ref)
        focused_element = self._walk(focused) if focused else None
        focused_app = str(_copy_attr(app, "AXTitle") or _copy_attr(app, "AXDescription") or "unknown")
        return AccessibilitySnapshot(
            timestamp=time.time(),
            platform="macos",
            backend_used="axapi",
            focused_app=focused_app,
            focused_element=focused_element,
            tree=root,
            raw_text=None,
            confidence=0.85,
        )

    def _walk(self, element: Any, depth: int = 0, max_depth: int = 8) -> UIElement:
        if depth >= max_depth:
            return UIElement("truncated", "...", None, set(), None, [], "accessibility")

        children_refs = _copy_attr(element, "AXChildren") or []
        children = [self._walk(child, depth + 1, max_depth) for child in children_refs[:50]]
        role = str(_copy_attr(element, "AXRole") or "element")
        title = str(_copy_attr(element, "AXTitle") or _copy_attr(element, "AXDescription") or "")
        value = _copy_attr(element, "AXValue")
        return UIElement(
            role=role,
            name=title,
            value=str(value) if value is not None else None,
            state=_states(element),
            bounds=_bounds(element),
            children=children,
            source="accessibility",
        )


def _copy_attr(element: Any, attr: str) -> Any:
    if element is None:
        return None
    try:
        return _unwrap_ax_result(AS.AXUIElementCopyAttributeValue(element, attr, None))
    except Exception:
        return None


def _unwrap_ax_result(result: Any) -> Any:
    """Normalize direct, tuple-return, and error-code AX API shapes."""
    if not isinstance(result, tuple):
        return result
    if len(result) == 2:
        error, value = result
        if isinstance(error, bool):
            return value if error else None
        return value if _is_success(error) else None
    if len(result) == 1:
        return result[0]
    return result[-1]


def _is_success(error: Any) -> bool:
    if error is None:
        return True
    try:
        return int(error) == 0
    except (TypeError, ValueError):
        return bool(error) is True


def _is_process_trusted() -> bool:
    checker = getattr(AS, "AXIsProcessTrusted", None)
    if checker is None:
        return True
    try:
        return bool(checker())
    except Exception:
        return False


def _states(element: Any) -> set[str]:
    states: set[str] = set()
    if _copy_attr(element, "AXFocused"):
        states.add("focused")
    if _copy_attr(element, "AXEnabled") is not False:
        states.add("enabled")
    return states


def _bounds(element: Any) -> tuple[int, int, int, int] | None:
    position = _unwrap_ax_value(
        _copy_attr(element, "AXPosition"),
        getattr(AS, "kAXValueCGPointType", None),
    )
    size = _unwrap_ax_value(
        _copy_attr(element, "AXSize"),
        getattr(AS, "kAXValueCGSizeType", None),
    )
    try:
        if not position or not size:
            return None
        x, y = _point_xy(position)
        width, height = _size_wh(size)
        return (int(x), int(y), int(width), int(height))
    except Exception:
        return None


def _unwrap_ax_value(value: Any, value_type: Any) -> Any:
    if value is None or value_type is None:
        return value
    getter = getattr(AS, "AXValueGetValue", None)
    if getter is None:
        return value
    try:
        return _unwrap_ax_result(getter(value, value_type, None))
    except Exception:
        return value


def _point_xy(point: Any) -> tuple[float, float]:
    if isinstance(point, dict):
        return float(point["x"]), float(point["y"])
    if isinstance(point, (tuple, list)):
        return float(point[0]), float(point[1])
    return float(point.x), float(point.y)


def _size_wh(size: Any) -> tuple[float, float]:
    if isinstance(size, dict):
        return float(size.get("width", size.get("w"))), float(size.get("height", size.get("h")))
    if isinstance(size, (tuple, list)):
        return float(size[0]), float(size[1])
    return float(size.width), float(size.height)


def _empty_snapshot(confidence: float = 0.0) -> AccessibilitySnapshot:
    root = UIElement(
        role="root",
        name="",
        value=None,
        state=set(),
        bounds=None,
        children=[],
        source="accessibility",
    )
    return AccessibilitySnapshot(
        timestamp=time.time(),
        platform="macos",
        backend_used="axapi",
        focused_app="unknown",
        focused_element=None,
        tree=root,
        raw_text=None,
        confidence=confidence,
    )
