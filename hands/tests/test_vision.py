from __future__ import annotations

import json
from io import BytesIO

from PIL import Image

from hands.accessibility.types import AccessibilitySnapshot, UIElement
from hands.vision.types import MarkedElement, VisionAction, INTERACTIVE_ROLES
from hands.vision.marker import (
    annotate_screenshot,
    build_annotated_screenshot,
    elements_to_text,
    extract_interactive_elements,
)
from hands.vision.actions import ActionExecutor
from hands.vision.agent import parse_llm_response


# ── Helpers ──────────────────────────────────────────────────────────

def _make_element(role="button", name="OK", bounds=(100, 100, 80, 30), children=None):
    return UIElement(
        role=role,
        name=name,
        value=None,
        state=set(),
        bounds=bounds,
        children=children or [],
        source="test",
    )


def _make_tree(*interactive_children):
    return UIElement(
        role="root",
        name="desktop",
        value=None,
        state=set(),
        bounds=(0, 0, 1920, 1080),
        children=list(interactive_children),
        source="test",
    )


def _make_screenshot(w=1920, h=1080) -> bytes:
    img = Image.new("RGB", (w, h), (30, 30, 30))
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _make_snapshot(tree: UIElement) -> AccessibilitySnapshot:
    return AccessibilitySnapshot(
        timestamp=1.0,
        platform="windows",
        backend_used="test",
        focused_app="TestApp",
        focused_element=None,
        tree=tree,
        raw_text=None,
        confidence=0.9,
    )


# ── extract_interactive_elements tests ───────────────────────────────

def test_extracts_buttons():
    tree = _make_tree(
        _make_element("button", "OK"),
        _make_element("button", "Cancel"),
    )
    elements = extract_interactive_elements(tree)
    assert len(elements) == 2
    assert elements[0].mark_id == 1
    assert elements[1].mark_id == 2
    assert elements[0].name == "OK"


def test_skips_non_interactive():
    tree = _make_tree(
        _make_element("pane", "Background"),
        _make_element("button", "Submit"),
        _make_element("group", "Container"),
    )
    elements = extract_interactive_elements(tree)
    assert len(elements) == 1
    assert elements[0].name == "Submit"


def test_skips_no_bounds():
    tree = _make_tree(
        _make_element("button", "Ghost", bounds=None),
        _make_element("button", "Visible", bounds=(10, 10, 50, 30)),
    )
    elements = extract_interactive_elements(tree)
    assert len(elements) == 1
    assert elements[0].name == "Visible"


def test_skips_zero_size():
    tree = _make_tree(
        _make_element("button", "ZeroW", bounds=(10, 10, 0, 30)),
        _make_element("button", "ZeroH", bounds=(10, 10, 30, 0)),
        _make_element("button", "Good", bounds=(10, 10, 30, 30)),
    )
    elements = extract_interactive_elements(tree)
    assert len(elements) == 1
    assert elements[0].name == "Good"


def test_nested_interactive_elements():
    tree = _make_tree(
        _make_element("menu", "File", bounds=(0, 0, 50, 20), children=[
            _make_element("menuitem", "Open", bounds=(0, 20, 100, 20)),
            _make_element("menuitem", "Save", bounds=(0, 40, 100, 20)),
        ]),
    )
    elements = extract_interactive_elements(tree)
    # menu + 2 menuitems = 3
    names = {e.name for e in elements}
    assert "File" in names
    assert "Open" in names
    assert "Save" in names


def test_detects_patterns():
    tree = _make_tree(
        _make_element("button", "Click Me"),
        _make_element("edit", "Username"),
        _make_element("checkbox", "Remember"),
    )
    elements = extract_interactive_elements(tree)
    button = next(e for e in elements if e.name == "Click Me")
    edit = next(e for e in elements if e.name == "Username")
    checkbox = next(e for e in elements if e.name == "Remember")
    assert "invoke" in button.patterns
    assert "value" in edit.patterns
    assert "toggle" in checkbox.patterns


# ── annotate_screenshot tests ────────────────────────────────────────

def test_annotate_produces_png():
    screenshot = _make_screenshot()
    elements = [
        MarkedElement(1, "button", "OK", None, (100, 100, 80, 30), True, ["invoke"]),
        MarkedElement(2, "edit", "Name", None, (100, 150, 200, 25), True, ["value"]),
    ]
    annotated, w, h = annotate_screenshot(screenshot, elements)
    assert isinstance(annotated, bytes)
    assert w == 1920
    assert h == 1080
    img = Image.open(BytesIO(annotated))
    assert img.format == "PNG"


def test_annotate_empty_elements():
    screenshot = _make_screenshot(800, 600)
    annotated, w, h = annotate_screenshot(screenshot, [])
    assert w == 800
    assert h == 600


# ── build_annotated_screenshot tests ─────────────────────────────────

def test_build_annotated_full_pipeline():
    tree = _make_tree(
        _make_element("button", "Submit", bounds=(200, 300, 100, 40)),
    )
    snapshot = _make_snapshot(tree)
    screenshot = _make_screenshot()
    result = build_annotated_screenshot(screenshot, snapshot)
    assert len(result.elements) == 1
    assert result.elements[0].name == "Submit"
    assert result.focused_app == "TestApp"
    assert len(result.image_b64) > 0


# ── elements_to_text tests ──────────────────────────────────────────

def test_elements_to_text():
    elements = [
        MarkedElement(1, "button", "OK", None, (0, 0, 50, 30), True, ["invoke"]),
        MarkedElement(2, "edit", "Name", "John", (0, 40, 200, 25), True, ["value"]),
    ]
    text = elements_to_text(elements)
    assert '[1] button "OK"' in text
    assert '[2] edit "Name" = \'John\'' in text
    assert "(invoke)" in text
    assert "(value)" in text


# ── parse_llm_response tests ────────────────────────────────────────

def test_parse_click_action():
    raw = '{"action": "click", "element_id": 7, "reason": "clicking submit"}'
    action = parse_llm_response(raw)
    assert action.action == "click"
    assert action.element_id == 7
    assert action.reason == "clicking submit"


def test_parse_type_action():
    raw = '{"action": "type", "element_id": 3, "text": "hello", "reason": "typing"}'
    action = parse_llm_response(raw)
    assert action.action == "type"
    assert action.text == "hello"


def test_parse_done():
    raw = '{"action": "done", "reason": "task complete"}'
    action = parse_llm_response(raw)
    assert action.action == "done"


def test_parse_markdown_wrapped():
    raw = '```json\n{"action": "click", "element_id": 1, "reason": "test"}\n```'
    action = parse_llm_response(raw)
    assert action.action == "click"
    assert action.element_id == 1


def test_parse_with_surrounding_text():
    raw = 'I think I should click the button.\n{"action": "click", "element_id": 5, "reason": "go"}\nDone!'
    action = parse_llm_response(raw)
    assert action.action == "click"
    assert action.element_id == 5


def test_parse_garbage_returns_fail():
    raw = "This is not JSON at all"
    action = parse_llm_response(raw)
    assert action.action == "fail"


# ── ActionExecutor tests (simulated mode) ────────────────────────────

def test_executor_simulated_click():
    executor = ActionExecutor()
    executor._backend = None  # force simulated mode
    elements = [MarkedElement(1, "button", "OK", None, (100, 100, 80, 30), True, ["invoke"])]
    action = VisionAction(action="click", element_id=1, reason="test")
    result = executor.execute(action, elements)
    assert result["success"] is True
    assert result.get("simulated") is True


def test_executor_done_action():
    executor = ActionExecutor()
    elements = []
    action = VisionAction(action="done", reason="complete")
    result = executor.execute(action, elements)
    assert result["success"] is True
    assert result["result"] == "task_complete"


def test_executor_fail_action():
    executor = ActionExecutor()
    elements = []
    action = VisionAction(action="fail", reason="cannot find element")
    result = executor.execute(action, elements)
    assert result["success"] is False


def test_executor_missing_element():
    executor = ActionExecutor()
    elements = [MarkedElement(1, "button", "OK", None, (100, 100, 80, 30), True, ["invoke"])]
    action = VisionAction(action="click", element_id=99, reason="test")
    result = executor.execute(action, elements)
    assert result["success"] is False
    assert "not found" in result["error"]


def test_executor_no_element_id():
    executor = ActionExecutor()
    elements = [MarkedElement(1, "button", "OK", None, (100, 100, 80, 30), True, ["invoke"])]
    action = VisionAction(action="click", element_id=None, reason="test")
    result = executor.execute(action, elements)
    assert result["success"] is False
