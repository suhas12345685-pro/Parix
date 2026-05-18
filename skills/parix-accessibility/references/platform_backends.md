# Accessibility Platform Backends — Quick Reference

## Architecture

```
AccessibilityBridge (__init__.py)
  +-- Platform backend (windows.py | macos.py | linux.py)
  +-- Vision fallback (vision.py)
  +-- Fusion (fusion.py)
```

## Platform Libraries

| Platform | Module | Library | Install |
|----------|--------|---------|---------|
| Windows | `windows.py` | pywinauto / comtypes | `pip install pywinauto` |
| macOS | `macos.py` | pyobjc (AXUIElement) | `pip install pyobjc-framework-Cocoa pyobjc-framework-ApplicationServices` |
| Linux | `linux.py` | pyatspi2 | `pip install pyatspi` or system `python3-pyatspi` |

## Vision Fallback Stack

| Component | Library | Purpose |
|-----------|---------|---------|
| Screenshot | `mss` | Fast cross-platform screen capture |
| OCR | Tesseract / Gemini Vision | Text + element extraction |
| Install | `pip install mss pytesseract` | All platforms |

## Key Data Types (types.py)

| Type | Fields | Description |
|------|--------|-------------|
| `UIElement` | role, name, value, bounds, children | Single UI element |
| `AccessibilitySnapshot` | tree, focused, window_title, timestamp | Full screen state |
| `Rect` | x, y, width, height | Screen coordinates |

## Fusion Priority

1. Accessibility tree data (structured, fast, preferred)
2. Vision OCR data (for elements missing from a11y tree)
3. Deduplication by overlapping screen position

## Capability Probing

`probe_accessibility() -> bool` -- returns True if platform a11y API works.
On failure: `CAPABILITY_MISSING` sent to Atrium for graceful degradation.

## Differentiator vs OpenClaw

OpenClaw uses vision-only. Parix uses hybrid a11y + vision fusion:
- Faster (structured tree vs screenshot OCR)
- More accurate (real element roles, names, values)
- Vision fills gaps (Electron apps without a11y support)
