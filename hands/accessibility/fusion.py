from __future__ import annotations

import time

from .types import AccessibilitySnapshot, UIElement


def merge(
    native_snapshot: AccessibilitySnapshot,
    vision_snapshot: AccessibilitySnapshot,
) -> AccessibilitySnapshot:
    fused_tree = _merge_elements(native_snapshot.tree, vision_snapshot.tree)
    return AccessibilitySnapshot(
        timestamp=time.time(),
        platform=native_snapshot.platform,
        backend_used="fused",
        focused_app=native_snapshot.focused_app or vision_snapshot.focused_app,
        focused_element=native_snapshot.focused_element or vision_snapshot.focused_element,
        tree=fused_tree,
        raw_text=vision_snapshot.raw_text,
        confidence=min(1.0, max(native_snapshot.confidence, vision_snapshot.confidence) + 0.05),
    )


def fuse(
    native_snapshot: AccessibilitySnapshot,
    vision_snapshot: AccessibilitySnapshot,
) -> AccessibilitySnapshot:
    return merge(native_snapshot, vision_snapshot)


def _merge_elements(native: UIElement, vision: UIElement) -> UIElement:
    name = native.name or vision.name
    value = native.value or vision.value
    children = list(native.children)

    if vision.children and not children:
        children = vision.children
    elif vision.children:
        children.extend(child for child in vision.children if child.name and not _has_named_child(children, child.name))

    return UIElement(
        role=native.role,
        name=name,
        value=value,
        state=set(native.state) | set(vision.state),
        bounds=native.bounds or vision.bounds,
        children=children,
        source="fused",
    )


def _has_named_child(children: list[UIElement], name: str) -> bool:
    return any(child.name == name for child in children)
