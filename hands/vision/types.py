from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class MarkedElement:
    mark_id: int
    role: str
    name: str
    value: str | None
    bounds: tuple[int, int, int, int] | None  # (x, y, w, h)
    interactable: bool
    patterns: list[str] = field(default_factory=list)  # UIA patterns: invoke, value, toggle, select, scroll, expand


@dataclass
class AnnotatedScreenshot:
    image_b64: str
    elements: list[MarkedElement]
    width: int
    height: int
    focused_app: str


@dataclass
class VisionAction:
    action: str  # click, type, scroll, select, toggle, read, done, fail
    element_id: int | None = None
    text: str | None = None
    reason: str = ""


@dataclass
class VisionStep:
    step: int
    screenshot_b64: str
    action_taken: VisionAction | None
    result: str = ""
    error: str | None = None


INTERACTIVE_ROLES = {
    "button", "menuitem", "listitem", "treeitem", "tabitem", "link",
    "checkbox", "radiobutton", "combobox", "edit", "text", "spinner",
    "slider", "hyperlink", "splitbutton", "menu", "toolbar",
    "pagetab", "page tab", "tab", "tab item",
    "Button", "MenuItem", "ListItem", "TreeItem", "TabItem", "Hyperlink",
    "CheckBox", "RadioButton", "ComboBox", "Edit", "Text", "Spinner",
    "Slider", "SplitButton", "Menu", "ToolBar",
}
