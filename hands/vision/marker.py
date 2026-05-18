"""Set-of-Mark: annotate screenshots with numbered markers on interactive elements.

Takes a screenshot + accessibility tree, draws numbered badges at each
interactive element's bounds, and returns the annotated image + element map.
"""

from __future__ import annotations

import base64
import io
from typing import Any

from PIL import Image, ImageDraw, ImageFont

from hands.accessibility.types import AccessibilitySnapshot, UIElement
from hands.vision.types import AnnotatedScreenshot, MarkedElement, INTERACTIVE_ROLES


BADGE_RADIUS = 12
BADGE_COLOR = (255, 80, 80)
BADGE_TEXT_COLOR = (255, 255, 255)
OUTLINE_COLOR = (255, 80, 80, 128)
OUTLINE_WIDTH = 2


def extract_interactive_elements(
    tree: UIElement,
    max_depth: int = 10,
) -> list[MarkedElement]:
    elements: list[MarkedElement] = []
    _walk(tree, elements, depth=0, max_depth=max_depth, counter=[1])
    return elements


def _walk(
    el: UIElement,
    out: list[MarkedElement],
    depth: int,
    max_depth: int,
    counter: list[int],
) -> None:
    if depth > max_depth:
        return

    role_lower = el.role.lower()
    is_interactive = (
        el.role in INTERACTIVE_ROLES
        or role_lower in {r.lower() for r in INTERACTIVE_ROLES}
    )

    if is_interactive and el.bounds and el.bounds[2] > 0 and el.bounds[3] > 0:
        patterns = _detect_patterns(role_lower)
        out.append(MarkedElement(
            mark_id=counter[0],
            role=el.role,
            name=el.name or "",
            value=el.value,
            bounds=el.bounds,
            interactable=True,
            patterns=patterns,
        ))
        counter[0] += 1

    for child in el.children:
        _walk(child, out, depth + 1, max_depth, counter)


def _detect_patterns(role: str) -> list[str]:
    patterns = []
    if role in {"button", "menuitem", "hyperlink", "link", "splitbutton"}:
        patterns.append("invoke")
    if role in {"edit", "text", "combobox", "spinner"}:
        patterns.append("value")
    if role in {"checkbox", "radiobutton"}:
        patterns.append("toggle")
    if role in {"listitem", "treeitem", "tabitem", "tab", "pagetab", "page tab", "tab item"}:
        patterns.append("select")
    if role in {"slider"}:
        patterns.append("range_value")
    return patterns


def annotate_screenshot(
    screenshot_bytes: bytes,
    elements: list[MarkedElement],
) -> tuple[bytes, int, int]:
    img = Image.open(io.BytesIO(screenshot_bytes)).convert("RGBA")
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    try:
        font = ImageFont.truetype("arial.ttf", 14)
    except (OSError, IOError):
        font = ImageFont.load_default()

    for el in elements:
        if not el.bounds:
            continue
        x, y, w, h = el.bounds

        draw.rectangle(
            [(x, y), (x + w, y + h)],
            outline=OUTLINE_COLOR,
            width=OUTLINE_WIDTH,
        )

        badge_x = x - BADGE_RADIUS
        badge_y = y - BADGE_RADIUS
        badge_x = max(0, badge_x)
        badge_y = max(0, badge_y)

        draw.ellipse(
            [badge_x, badge_y, badge_x + BADGE_RADIUS * 2, badge_y + BADGE_RADIUS * 2],
            fill=BADGE_COLOR,
        )

        label = str(el.mark_id)
        bbox = font.getbbox(label)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        tx = badge_x + BADGE_RADIUS - tw // 2
        ty = badge_y + BADGE_RADIUS - th // 2
        draw.text((tx, ty), label, fill=BADGE_TEXT_COLOR, font=font)

    composited = Image.alpha_composite(img, overlay).convert("RGB")

    buf = io.BytesIO()
    composited.save(buf, format="PNG")
    png_bytes = buf.getvalue()

    return png_bytes, img.width, img.height


def build_annotated_screenshot(
    screenshot_bytes: bytes,
    snapshot: AccessibilitySnapshot,
) -> AnnotatedScreenshot:
    elements = extract_interactive_elements(snapshot.tree)
    annotated_png, w, h = annotate_screenshot(screenshot_bytes, elements)
    image_b64 = base64.b64encode(annotated_png).decode("ascii")

    return AnnotatedScreenshot(
        image_b64=image_b64,
        elements=elements,
        width=w,
        height=h,
        focused_app=snapshot.focused_app,
    )


def elements_to_text(elements: list[MarkedElement]) -> str:
    lines = []
    for el in elements:
        desc = f"[{el.mark_id}] {el.role}"
        if el.name:
            desc += f' "{el.name}"'
        if el.value:
            desc += f" = {el.value!r}"
        if el.patterns:
            desc += f" ({', '.join(el.patterns)})"
        lines.append(desc)
    return "\n".join(lines)
