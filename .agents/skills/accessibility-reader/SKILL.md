---
name: accessibility-reader
description: Read the OS UI accessibility tree — buttons, menus, text fields, focused element. Read-only, never interacts.
---

# Accessibility Reader

> Use when the agent needs to understand what's on screen semantically — what buttons exist, what's focused, what text is displayed.

## Usage

```python
from hands.accessibility import AccessibilityBridge

bridge = AccessibilityBridge()
snapshot = await bridge.snapshot(mode="auto")

# snapshot.tree        — UIElement tree (full hierarchy)
# snapshot.focused_app — name of the foreground application
# snapshot.confidence  — 0.0–1.0 reliability score
# snapshot.backend_used — "uiautomation", "vision", "fused", or "none"
```

## Modes

| Mode | Behavior |
|---|---|
| `auto` | Try native accessibility, fall back to vision OCR |
| `accessibility` | Native only (pywinauto/AT-SPI2/AX API) |
| `vision` | Screenshot + Tesseract OCR only |
| `fused` | Both native + vision, merged into one tree |

## Platform Backends

| Platform | Library | Backend |
|---|---|---|
| Windows | pywinauto (UIA) | UIAutomation tree |
| macOS | pyobjc (AX API) | Accessibility API |
| Linux | pyatspi2 / gi | AT-SPI2 |
| Fallback | mss + Tesseract | OCR text lines |

## Data Types

```python
@dataclass
class UIElement:
    role: str           # button, edit, menu, text, etc.
    name: str           # accessible name
    value: str | None   # current value
    state: set[str]     # enabled, focused, visible
    bounds: tuple | None # (x, y, width, height)
    children: list      # child elements
    source: str         # accessibility, vision, fused
```

## Rules

- **Read-only** — never call `.click()`, `.type_keys()`, `.set_focus()`
- Tree depth is capped at 8 to prevent hangs
- Backend failures return empty snapshot (confidence 0.0), never crash

## Key Files

- `hands/accessibility/__init__.py` — AccessibilityBridge
- `hands/accessibility/types.py` — UIElement, AccessibilitySnapshot
- `hands/accessibility/windows.py` — Windows UIAutomation
- `hands/accessibility/vision.py` — mss + Tesseract fallback
- `hands/accessibility/fusion.py` — merge native + vision trees
