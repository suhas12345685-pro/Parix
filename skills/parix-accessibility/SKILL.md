---
name: parix-accessibility
description: Parix Skill — Accessibility & Vision Layer
---

# Parix Skill — Accessibility & Vision Layer

> Use when working on the hybrid accessibility + vision system — Parix's technical moat for deep OS understanding.

## Critical Rule: Read-Only Observation

The accessibility layer is **read-only**. Parix observes the UI — it never controls it on the user's desktop.

- **BANNED:** `pyautogui`, `pynput`, `keyboard`, `mouse` — these steal focus and break on user interaction
- **BANNED:** `pywinauto` `.click()`, `.type_keys()`, `.set_focus()` on the user's active desktop
- **ALLOWED:** `pywinauto` tree queries (`.children()`, `.window_text()`, `.element_info`) — read-only
- **ALLOWED:** `mss` screenshots — read-only screen capture
- **ALLOWED:** `ctypes` Win32 `GetForegroundWindow` / `GetWindowTextW` — read-only
- If Parix needs to interact with a GUI, it must use a **virtual desktop** (pyvda) or **headless browser** (Playwright)

## Architecture

```
AccessibilityBridge (__init__.py)
  ├── Platform-specific backend
  │   ├── windows.py — UIAutomation (pywinauto/comtypes)
  │   ├── macos.py — Accessibility API (pyobjc)
  │   └── linux.py — AT-SPI2 (pyatspi2)
  ├── Vision fallback
  │   └── vision.py — mss screenshot + Tesseract/Gemini OCR
  └── Fusion
      └── fusion.py — Merge accessibility tree + vision into unified snapshot
```

## Key Data Types (`types.py`)

```python
@dataclass
class UIElement:
    role: str          # button, text, menu, etc.
    name: str          # accessible name
    value: str         # current value
    bounds: Rect       # screen coordinates
    children: list     # child elements

@dataclass
class AccessibilitySnapshot:
    tree: UITree       # full accessibility tree
    focused: UIElement # currently focused element
    window_title: str  # active window title
    timestamp: float
```

## Platform Backends

| Platform | Module | Library | Capability |
|----------|--------|---------|------------|
| Windows | `windows.py` | pywinauto / comtypes | Full UIAutomation tree |
| macOS | `macos.py` | pyobjc (AXUIElement) | Same API surface as OpenClaw |
| Linux | `linux.py` | pyatspi2 | AT-SPI2 for GNOME/KDE |

## Vision Fallback

When accessibility APIs aren't available (e.g., Electron apps with no a11y):

1. `mss` captures screenshot
2. Tesseract OCR or Gemini Vision extracts text + element positions
3. Results merged with whatever accessibility data is available

## Fusion (`fusion.py`)

Combines accessibility tree + vision into a single `AccessibilitySnapshot`:
- Prefers accessibility data (structured, fast)
- Falls back to vision for elements not in the a11y tree
- Deduplicates overlapping elements by screen position

## Capability Probing

```python
def probe_accessibility() -> bool:
    # Returns True if platform a11y API is functional
```

If probe fails → CAPABILITY_MISSING sent to Atrium → graceful degradation.

## Dependencies

```bash
# Windows
pip install pywinauto

# macOS
pip install pyobjc-framework-Cocoa pyobjc-framework-ApplicationServices

# Linux
pip install pyatspi  # or system package python3-pyatspi

# Vision fallback (all platforms)
pip install mss pytesseract
```
