---
name: parix-accessibility-vision
description: Build or repair Parix Hands accessibility, OCR, and fused UI snapshot modules. Use when editing `hands/accessibility/*`, implementing Windows UIAutomation, macOS AX API, Linux AT-SPI2, mss/Tesseract vision fallback, or ACCESSIBILITY_SNAPSHOT behavior.
---

# Parix Accessibility Vision

## Workflow

1. Read `accessibility-layer.md` and `hands/accessibility/types.py` before changing backend behavior.
2. Preserve the unified snapshot contract: `UIElement` tree plus `AccessibilitySnapshot`.
3. Use native accessibility first, vision fallback second, and fusion when both are requested.
4. Guard every optional platform import with `try/except ImportError`.
5. Keep backend failures local: return an empty or lower-confidence snapshot instead of crashing Hands.
6. Limit tree traversal depth and child count so bad UI trees cannot hang the agent.

## Backend Shape

- Windows: use `pywinauto.Desktop(backend="uia")`.
- macOS: use `ApplicationServices` AX APIs.
- Linux: use `pyatspi` or `gi.repository.Atspi`.
- Vision: capture with `mss`, OCR by subprocess call to `tesseract`, and return pseudo text nodes.
- Fusion: keep native structure as the backbone, fill missing names/values from vision text, and increase confidence only slightly.

## Verification

Run:

```powershell
python -m compileall hands
@'
from hands.accessibility import AccessibilityBridge
print(AccessibilityBridge().is_native_available())
'@ | python -
```
