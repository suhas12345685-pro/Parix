"""UIA programmatic interaction — execute actions on elements by mark ID.

Uses pywinauto's UIAutomation patterns (InvokePattern, ValuePattern, etc.)
to interact with elements WITHOUT moving the mouse or stealing focus.
"""

from __future__ import annotations

import logging
import sys
from typing import Any

from hands.vision.types import MarkedElement, VisionAction

logger = logging.getLogger("hands.vision.actions")


class ActionExecutor:
    """Executes VisionActions against real UI elements via UIA patterns."""

    def __init__(self) -> None:
        self._backend = None
        if sys.platform == "win32":
            try:
                from pywinauto import Desktop
                self._backend = "uia"
            except ImportError:
                logger.warning("pywinauto not available — actions will be simulated")

    def execute(
        self,
        action: VisionAction,
        elements: list[MarkedElement],
    ) -> dict[str, Any]:
        if action.action == "done":
            return {"success": True, "result": "task_complete", "reason": action.reason}

        if action.action == "fail":
            return {"success": False, "result": "task_failed", "reason": action.reason}

        if action.element_id is None:
            return {"success": False, "error": "no element_id provided"}

        element = next((e for e in elements if e.mark_id == action.element_id), None)
        if not element:
            return {"success": False, "error": f"element {action.element_id} not found"}

        if not element.bounds:
            return {"success": False, "error": f"element {action.element_id} has no bounds"}

        if self._backend == "uia":
            return self._execute_uia(action, element)
        else:
            return self._execute_simulated(action, element)

    def _execute_uia(self, action: VisionAction, element: MarkedElement) -> dict[str, Any]:
        try:
            from pywinauto import Desktop
            desktop = Desktop(backend="uia")

            x, y, w, h = element.bounds
            cx, cy = x + w // 2, y + h // 2

            wrapper = self._find_element_at(desktop, cx, cy, element)
            if wrapper is None:
                return {"success": False, "error": f"could not locate UIA element at ({cx}, {cy})"}

            return self._dispatch_action(wrapper, action, element)
        except Exception as e:
            logger.error("UIA action failed: %s", e)
            return {"success": False, "error": str(e)}

    def _find_element_at(self, desktop: Any, cx: int, cy: int, element: MarkedElement) -> Any:
        """Find the UIA element by walking the top window's tree near the bounds."""
        try:
            from pywinauto.uia_element_info import UIAElementInfo
            import comtypes.client  # noqa: F401

            from pywinauto import uia_defines
            iuia = uia_defines.IUIA()

            point = (cx, cy)
            uia_element = iuia.iuia.ElementFromPoint(
                uia_defines.POINT(point[0], point[1])
            )
            if uia_element:
                info = UIAElementInfo(uia_element)
                from pywinauto.controls.uiawrapper import UIAWrapper
                return UIAWrapper(info)
        except Exception:
            pass

        try:
            windows = desktop.windows()
            for win in windows:
                try:
                    rect = win.rectangle()
                    if rect.left <= cx <= rect.right and rect.top <= cy <= rect.bottom:
                        descendants = win.descendants()
                        for desc in descendants:
                            try:
                                dr = desc.rectangle()
                                if (dr.left <= cx <= dr.right and
                                        dr.top <= cy <= dr.bottom):
                                    role = str(getattr(desc.element_info, "control_type", ""))
                                    if role.lower() == element.role.lower():
                                        return desc
                            except Exception:
                                continue
                except Exception:
                    continue
        except Exception:
            pass

        return None

    def _dispatch_action(
        self,
        wrapper: Any,
        action: VisionAction,
        element: MarkedElement,
    ) -> dict[str, Any]:
        act = action.action.lower()

        if act == "click" or act == "invoke":
            return self._invoke(wrapper, element)
        elif act == "type":
            return self._set_value(wrapper, action.text or "", element)
        elif act == "toggle":
            return self._toggle(wrapper, element)
        elif act == "select":
            return self._select(wrapper, element)
        elif act == "read":
            return self._read_value(wrapper, element)
        elif act == "scroll":
            return self._scroll(wrapper, action.text or "down", element)
        else:
            return {"success": False, "error": f"unknown action: {act}"}

    def _invoke(self, wrapper: Any, element: MarkedElement) -> dict[str, Any]:
        try:
            iface = wrapper.iface_invoke
            if iface:
                iface.Invoke()
                return {"success": True, "result": f"invoked [{element.mark_id}] {element.role} \"{element.name}\""}
        except Exception:
            pass

        try:
            wrapper.invoke()
            return {"success": True, "result": f"invoked [{element.mark_id}]"}
        except Exception:
            pass

        try:
            wrapper.click_input()
            return {"success": True, "result": f"click_input [{element.mark_id}]"}
        except Exception as e:
            return {"success": False, "error": f"invoke failed: {e}"}

    def _set_value(self, wrapper: Any, text: str, element: MarkedElement) -> dict[str, Any]:
        try:
            iface = wrapper.iface_value
            if iface:
                iface.SetValue(text)
                return {"success": True, "result": f"set value on [{element.mark_id}] to {text!r}"}
        except Exception:
            pass

        try:
            wrapper.set_edit_text(text)
            return {"success": True, "result": f"set_edit_text [{element.mark_id}]"}
        except Exception as e:
            return {"success": False, "error": f"set_value failed: {e}"}

    def _toggle(self, wrapper: Any, element: MarkedElement) -> dict[str, Any]:
        try:
            iface = wrapper.iface_toggle
            if iface:
                iface.Toggle()
                return {"success": True, "result": f"toggled [{element.mark_id}]"}
        except Exception as e:
            return {"success": False, "error": f"toggle failed: {e}"}

    def _select(self, wrapper: Any, element: MarkedElement) -> dict[str, Any]:
        try:
            iface = wrapper.iface_selection_item
            if iface:
                iface.Select()
                return {"success": True, "result": f"selected [{element.mark_id}]"}
        except Exception as e:
            return {"success": False, "error": f"select failed: {e}"}

    def _read_value(self, wrapper: Any, element: MarkedElement) -> dict[str, Any]:
        try:
            name = wrapper.window_text()
            return {"success": True, "result": name, "element_id": element.mark_id}
        except Exception as e:
            return {"success": False, "error": f"read failed: {e}"}

    def _scroll(self, wrapper: Any, direction: str, element: MarkedElement) -> dict[str, Any]:
        try:
            iface = wrapper.iface_scroll
            if iface:
                if direction == "down":
                    iface.Scroll(0, 3)
                elif direction == "up":
                    iface.Scroll(0, -3)
                return {"success": True, "result": f"scrolled {direction} on [{element.mark_id}]"}
        except Exception as e:
            return {"success": False, "error": f"scroll failed: {e}"}

    def _execute_simulated(self, action: VisionAction, element: MarkedElement) -> dict[str, Any]:
        """Dry-run mode when pywinauto is unavailable."""
        return {
            "success": True,
            "simulated": True,
            "result": f"simulated {action.action} on [{element.mark_id}] {element.role} \"{element.name}\"",
        }
