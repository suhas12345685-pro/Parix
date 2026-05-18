from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class UIElement:
    role: str
    name: str
    value: str | None
    state: set[str]
    bounds: tuple[int, int, int, int] | None
    children: list["UIElement"] = field(default_factory=list)
    source: str = "accessibility"

    def summarize(self) -> dict[str, Any]:
        """Compact dict form: own fields + flat list of immediate children."""
        return {
            "role": self.role,
            "name": (self.name or "")[:120],
            "value": (self.value or "")[:120] if self.value else None,
            "state": sorted(self.state),
            "bounds": list(self.bounds) if self.bounds else None,
            "source": self.source,
            "childCount": len(self.children),
        }


@dataclass
class AccessibilitySnapshot:
    timestamp: float
    platform: str
    backend_used: str
    focused_app: str
    focused_element: UIElement | None
    tree: UIElement
    raw_text: str | None
    confidence: float

    def summarize(self, child_depth: int = 2) -> dict[str, Any]:
        """Wire-safe summary: focused element + N levels of context.

        The full tree is too large to ship on every poll cycle. The summary
        carries only what cognition needs: which app/element is focused, the
        role/name of the focused thing, and a shallow window around it.
        """
        return {
            "ts": self.timestamp,
            "platform": self.platform,
            "backend_used": self.backend_used,
            "focused_app": self.focused_app[:160],
            "focused_element": _summarize_element(self.focused_element, child_depth)
            if self.focused_element is not None
            else None,
            "confidence": self.confidence,
            "had_raw_text": self.raw_text is not None and bool(self.raw_text.strip()),
        }

    def fingerprint(self) -> str:
        """A compact stable string used by the poller to detect 'same state.'

        Two snapshots whose fingerprints match represent the same UI focus
        situation, so the poller can suppress the second one. Only the bits
        that meaningfully change should be in here — not the timestamp.
        """
        focused = self.focused_element
        parts = [
            self.backend_used,
            self.focused_app or "",
            focused.role if focused else "",
            (focused.name or "")[:80] if focused else "",
            (focused.value or "")[:80] if focused and focused.value else "",
            "|".join(sorted(focused.state)) if focused else "",
        ]
        return "::".join(parts)


def _summarize_element(el: UIElement, depth: int) -> dict[str, Any]:
    base = el.summarize()
    if depth > 0 and el.children:
        base["children"] = [
            _summarize_element(child, depth - 1) for child in el.children[:8]
        ]
    return base
