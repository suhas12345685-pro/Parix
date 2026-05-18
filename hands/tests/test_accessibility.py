from __future__ import annotations

import importlib
import asyncio
import sys
import types

from hands.accessibility import AccessibilityBridge
from hands.accessibility.fusion import merge
from hands.accessibility.types import AccessibilitySnapshot, UIElement


def test_bridge_returns_empty_snapshot_when_no_backend(monkeypatch):
    monkeypatch.setattr(sys, "platform", "unknown")
    bridge = AccessibilityBridge()

    snapshot = asyncio.run(bridge.snapshot("accessibility"))

    assert snapshot.backend_used == "none"
    assert snapshot.confidence == 0.0


def test_fusion_preserves_native_structure_and_vision_text():
    native = snapshot("uiautomation", UIElement("button", "", None, {"enabled"}, None, [], "accessibility"), None)
    vision = snapshot("vision", UIElement("text", "Apply Fix", "Apply Fix", set(), None, [], "vision"), "Apply Fix")

    fused = merge(native, vision)

    assert fused.backend_used == "fused"
    assert fused.tree.name == "Apply Fix"
    assert fused.raw_text == "Apply Fix"


def test_windows_backend_imports_with_mocked_pywinauto(monkeypatch):
    module = types.ModuleType("pywinauto")
    module.Desktop = object
    monkeypatch.setitem(sys.modules, "pywinauto", module)
    sys.modules.pop("hands.accessibility.windows", None)

    imported = importlib.import_module("hands.accessibility.windows")

    assert hasattr(imported, "WindowsBackend")


def test_macos_backend_imports_with_mocked_application_services(monkeypatch):
    module = types.ModuleType("ApplicationServices")
    module.AXUIElementCreateSystemWide = lambda: object()
    module.AXUIElementCopyAttributeValue = lambda *_: None
    monkeypatch.setitem(sys.modules, "ApplicationServices", module)
    sys.modules.pop("hands.accessibility.macos", None)

    imported = importlib.import_module("hands.accessibility.macos")

    assert hasattr(imported, "MacOSBackend")


def test_macos_backend_returns_low_confidence_when_process_untrusted(monkeypatch):
    module = types.ModuleType("ApplicationServices")
    module.AXIsProcessTrusted = lambda: False
    module.AXUIElementCreateSystemWide = lambda: (_ for _ in ()).throw(
        AssertionError("should not read AX tree without trust")
    )
    module.AXUIElementCopyAttributeValue = lambda *_: None
    monkeypatch.setitem(sys.modules, "ApplicationServices", module)
    sys.modules.pop("hands.accessibility.macos", None)

    imported = importlib.import_module("hands.accessibility.macos")
    snapshot = imported.MacOSBackend()._get_tree_sync()

    assert snapshot.backend_used == "axapi"
    assert snapshot.focused_app == "unknown"
    assert snapshot.confidence == 0.1


def test_macos_backend_unwraps_tuple_returns_and_ax_values(monkeypatch):
    module = types.ModuleType("ApplicationServices")
    module.kAXValueCGPointType = "point"
    module.kAXValueCGSizeType = "size"
    module.AXIsProcessTrusted = lambda: True

    system = object()
    app = object()
    focused = object()
    child = object()
    point_token = object()
    size_token = object()

    module.AXUIElementCreateSystemWide = lambda: system

    def copy_attr(element, attr, _out):
        values = {
            (system, "AXFocusedApplication"): (0, app),
            (system, "AXFocusedUIElement"): (0, focused),
            (app, "AXTitle"): (0, "Demo App"),
            (app, "AXChildren"): (0, [focused]),
            (app, "AXRole"): (0, "AXApplication"),
            (app, "AXDescription"): (0, ""),
            (app, "AXFocused"): (0, False),
            (app, "AXEnabled"): (0, True),
            (app, "AXPosition"): (0, point_token),
            (app, "AXSize"): (0, size_token),
            (focused, "AXChildren"): (0, [child]),
            (focused, "AXRole"): (0, "AXButton"),
            (focused, "AXTitle"): (0, "Run"),
            (focused, "AXDescription"): (0, ""),
            (focused, "AXValue"): (0, None),
            (focused, "AXFocused"): (0, True),
            (focused, "AXEnabled"): (0, True),
            (focused, "AXPosition"): (0, point_token),
            (focused, "AXSize"): (0, size_token),
            (child, "AXChildren"): (0, []),
            (child, "AXRole"): (0, "AXStaticText"),
            (child, "AXTitle"): (0, "Ready"),
            (child, "AXDescription"): (0, ""),
            (child, "AXValue"): (0, "Ready"),
            (child, "AXFocused"): (0, False),
            (child, "AXEnabled"): (0, True),
            (child, "AXPosition"): (0, point_token),
            (child, "AXSize"): (0, size_token),
        }
        return values.get((element, attr), (1, None))

    def ax_value_get(value, value_type, _out):
        if value == point_token and value_type == "point":
            return (True, (12.5, 24.0))
        if value == size_token and value_type == "size":
            return (True, {"width": 80.0, "height": 30.0})
        return (False, None)

    module.AXUIElementCopyAttributeValue = copy_attr
    module.AXValueGetValue = ax_value_get
    monkeypatch.setitem(sys.modules, "ApplicationServices", module)
    sys.modules.pop("hands.accessibility.macos", None)

    imported = importlib.import_module("hands.accessibility.macos")
    snapshot = imported.MacOSBackend()._get_tree_sync()

    assert snapshot.focused_app == "Demo App"
    assert snapshot.focused_element.name == "Run"
    assert snapshot.focused_element.bounds == (12, 24, 80, 30)
    assert snapshot.tree.children[0].name == "Run"


def test_linux_backend_imports_with_mocked_pyatspi(monkeypatch):
    module = types.ModuleType("pyatspi")
    module.Registry = object()
    monkeypatch.setitem(sys.modules, "pyatspi", module)
    sys.modules.pop("hands.accessibility.linux", None)

    imported = importlib.import_module("hands.accessibility.linux")

    assert hasattr(imported, "LinuxBackend")


def test_linux_backend_uses_get_child_at_index(monkeypatch):
    class FakeState:
        def contains(self, _state):
            return False

    class FakeElement:
        def __init__(self, name, children=None):
            self.name = name
            self.childCount = len(children or [])
            self._children = children or []

        def get_child_at_index(self, index):
            return self._children[index]

        def __getitem__(self, index):
            raise AssertionError("AT-SPI path should use get_child_at_index")

        def getRoleName(self):
            return "frame"

        def getState(self):
            return FakeState()

    module = types.ModuleType("pyatspi")
    module.Registry = object()
    monkeypatch.setitem(sys.modules, "pyatspi", module)
    sys.modules.pop("hands.accessibility.linux", None)

    imported = importlib.import_module("hands.accessibility.linux")
    tree = imported.LinuxBackend()._walk(FakeElement("root", [FakeElement("child")]))

    assert tree.name == "root"
    assert tree.children[0].name == "child"


def snapshot(backend: str, tree: UIElement, raw_text: str | None) -> AccessibilitySnapshot:
    return AccessibilitySnapshot(
        timestamp=1.0,
        platform="windows",
        backend_used=backend,
        focused_app="app",
        focused_element=None,
        tree=tree,
        raw_text=raw_text,
        confidence=0.7,
    )
