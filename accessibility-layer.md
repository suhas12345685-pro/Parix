# Hybrid Accessibility + Vision Layer — The Technical Moat

OpenClaw uses macOS Accessibility API to read screen structure — that's why it's precise. But it's macOS-only. Parix's moat is doing this **on every platform**, with vision as a universal fallback and fusion when both are available.

## Why This Matters

| Approach | Speed | Precision | Cross-Platform | Works on Custom UI |
|----------|-------|-----------|----------------|-------------------|
| Accessibility API only (OpenClaw) | Fast (<50ms) | High — structured tree | macOS only | No — needs app support |
| Vision only (screenshot + OCR) | Slow (500ms-2s) | Medium — OCR errors | Yes | Yes — sees pixels |
| **Hybrid (Parix)** | **Fast with fallback** | **High with visual context** | **Yes** | **Yes** |

## Architecture

```
hands/accessibility/
├── __init__.py      # AccessibilityBridge — platform dispatch + unified interface
├── types.py         # UIElement, UITree, AccessibilitySnapshot
├── windows.py       # UIAutomation backend
├── macos.py         # macOS Accessibility backend
├── linux.py         # AT-SPI2 backend
├── vision.py        # OCR fallback backend
└── fusion.py        # Merge structured tree + visual context
```

## Unified Interface

```python
# hands/accessibility/types.py

@dataclass
class UIElement:
    role: str                    # 'button', 'text_field', 'menu_item', 'window', etc.
    name: str                    # accessible name / label
    value: str | None            # current value (for inputs, sliders, etc.)
    state: set[str]              # {'focused', 'enabled', 'selected', 'expanded', ...}
    bounds: tuple[int, int, int, int] | None  # (x, y, width, height) screen coords
    children: list['UIElement']
    source: str                  # 'accessibility' | 'vision' | 'fused'

@dataclass
class AccessibilitySnapshot:
    timestamp: float
    platform: str                # 'windows' | 'macos' | 'linux'
    backend_used: str            # 'uiautomation' | 'atspi' | 'axapi' | 'vision' | 'fused'
    focused_app: str
    focused_element: UIElement | None
    tree: UIElement              # root of the UI tree
    raw_text: str | None         # OCR text if vision was used
    confidence: float            # 0.0-1.0 — how complete is this snapshot
```

```python
# hands/accessibility/__init__.py

class AccessibilityBridge:
    """
    Unified screen reading. Tries platform-native accessibility first,
    falls back to vision, fuses both when available.
    """

    def __init__(self):
        self.backend = self._detect_backend()
        self.vision = VisionBackend()

    def _detect_backend(self) -> AccessibilityBackend | None:
        if sys.platform == 'win32':
            try:
                from .windows import WindowsBackend
                return WindowsBackend()
            except ImportError:
                return None
        elif sys.platform == 'darwin':
            try:
                from .macos import MacOSBackend
                return MacOSBackend()
            except ImportError:
                return None
        elif sys.platform.startswith('linux'):
            try:
                from .linux import LinuxBackend
                return LinuxBackend()
            except ImportError:
                return None
        return None

    async def snapshot(self, mode: str = 'auto') -> AccessibilitySnapshot:
        """
        mode:
          'auto'          — accessibility first, vision fallback, fuse if both available
          'accessibility' — structured tree only (fast, may be incomplete)
          'vision'        — screenshot + OCR only (slow, always works)
          'fused'         — force both and merge
        """
        a11y_result = None
        vision_result = None

        if mode in ('auto', 'accessibility', 'fused') and self.backend:
            try:
                a11y_result = await self.backend.get_tree()
            except Exception as e:
                logger.warn(f"Accessibility backend failed: {e}")

        if mode == 'vision' or (mode == 'auto' and a11y_result is None) or mode == 'fused':
            vision_result = await self.vision.capture_and_ocr()

        if a11y_result and vision_result:
            return fuse(a11y_result, vision_result)
        elif a11y_result:
            return a11y_result
        elif vision_result:
            return vision_result
        else:
            return AccessibilitySnapshot(
                timestamp=time.time(), platform=sys.platform,
                backend_used='none', focused_app='unknown',
                focused_element=None, tree=UIElement(role='root', name='', value=None, state=set(), bounds=None, children=[], source='none'),
                raw_text=None, confidence=0.0
            )

    def is_native_available(self) -> bool:
        return self.backend is not None
```

## Platform Backends

### Windows — UIAutomation

```python
# hands/accessibility/windows.py
# Uses pywinauto (wraps UIAutomation COM API)
# Reads: window tree, control types, names, values, states, bounding rects
# Deps: pywinauto (pip install pywinauto)

from pywinauto import Desktop

class WindowsBackend(AccessibilityBackend):
    def get_tree(self) -> AccessibilitySnapshot:
        desktop = Desktop(backend='uia')
        app = desktop.top_window()
        tree = self._walk(app.wrapper_object())
        return AccessibilitySnapshot(
            platform='windows', backend_used='uiautomation',
            focused_app=app.window_text(), tree=tree, confidence=0.9, ...
        )

    def _walk(self, element, depth=0, max_depth=8) -> UIElement:
        if depth >= max_depth:
            return UIElement(role='truncated', name='...', ...)
        children = [self._walk(c, depth+1, max_depth) for c in element.children()]
        return UIElement(
            role=element.element_info.control_type,
            name=element.element_info.name,
            value=getattr(element, 'window_text', lambda: None)(),
            state=self._get_states(element),
            bounds=element.rectangle().mid_point() if hasattr(element, 'rectangle') else None,
            children=children, source='accessibility'
        )
```

### macOS — Accessibility API

```python
# hands/accessibility/macos.py
# Uses pyobjc to access AXUIElement API — same underlying API that OpenClaw uses
# Deps: pyobjc-framework-ApplicationServices (pip install pyobjc-framework-ApplicationServices)

import ApplicationServices as AS

class MacOSBackend(AccessibilityBackend):
    def get_tree(self) -> AccessibilitySnapshot:
        system_element = AS.AXUIElementCreateSystemWide()
        focused_app_ref = AS.AXUIElementCopyAttributeValue(system_element, 'AXFocusedApplication', None)
        # Walk AXChildren recursively, extract AXRole, AXTitle, AXValue, AXPosition, AXSize
        ...
```

### Linux — AT-SPI2

```python
# hands/accessibility/linux.py
# Uses pyatspi2 to read the accessibility tree via D-Bus
# Works with GNOME, KDE, and any toolkit that implements AT-SPI
# Deps: python3-pyatspi (system package) or pyatspi2 (pip)

import pyatspi

class LinuxBackend(AccessibilityBackend):
    def get_tree(self) -> AccessibilitySnapshot:
        desktop = pyatspi.Registry.getDesktop(0)
        focused = pyatspi.findFocusedObject(desktop)
        app = focused.getApplication() if focused else desktop[0]
        tree = self._walk(app)
        ...
```

## Vision Fallback

```python
# hands/accessibility/vision.py
# When no accessibility backend is available (or app doesn't expose a11y tree)

import mss
import pytesseract  # or call Gemini vision API for more accurate OCR

class VisionBackend:
    async def capture_and_ocr(self) -> AccessibilitySnapshot:
        with mss.mss() as sct:
            screenshot = sct.grab(sct.monitors[1])

        # Option A: Local OCR (fast, free, less accurate)
        text = pytesseract.image_to_string(screenshot)

        # Option B: Gemini Vision (slower, costs tokens, much more accurate)
        # Only used when local OCR confidence is low or when Context Fusion
        # specifically requests visual understanding

        return AccessibilitySnapshot(
            backend_used='vision', raw_text=text, confidence=0.6,
            tree=self._text_to_pseudo_tree(text), ...
        )
```

## Fusion — The Real Differentiator

```python
# hands/accessibility/fusion.py

def fuse(a11y: AccessibilitySnapshot, vision: AccessibilitySnapshot) -> AccessibilitySnapshot:
    """
    Merge structured accessibility tree with visual context.

    Accessibility gives: element types, names, states, hierarchy
    Vision gives: actual text content (useful when a11y names are empty),
                  visual layout, colors, images, screen regions a11y can't see

    Fusion strategy:
    1. Use a11y tree as the structural backbone
    2. For any UIElement with empty name/value, try to fill from OCR text
       by matching bounding rectangles to OCR word positions
    3. Add vision-only elements (images, decorative text, custom-drawn UI)
       as children of the nearest a11y element by position
    4. Confidence = max(a11y.confidence, vision.confidence) + 0.05 bonus
    """
    fused_tree = _merge_trees(a11y.tree, vision.tree)
    return AccessibilitySnapshot(
        backend_used='fused',
        tree=fused_tree,
        raw_text=vision.raw_text,
        confidence=min(1.0, max(a11y.confidence, vision.confidence) + 0.05),
        ...
    )
```

## Integration Points

**1. Sensors — `watcher.py` upgrade**
Instead of just polling `pygetwindow` for window title, `watcher.py` calls `AccessibilityBridge.snapshot()` on each poll cycle. This gives the Council structured UI context, not just a string.

**2. Context Fusion — `context-fusion.ts` upgrade**
The `signals.active_window` field becomes a full `AccessibilitySnapshot` serialized as JSON. Context Fusion can now reason about *what UI elements are visible*, not just "which app is focused."

**3. Silent Intent Detectors — richer signals**
`detect_read_without_edit` can now check if the user has a text field focused but hasn't typed (via `UIElement.state`), instead of guessing from window title.

**4. Protocol addition — `ACCESSIBILITY_SNAPSHOT`**
```json
"ACCESSIBILITY_SNAPSHOT": {
  "from": "hands",
  "fields": ["snapshot_id", "focused_app", "backend_used", "tree_summary", "confidence", "timestamp"]
}
```
Note: The full tree is too large for every message. Send a summary (focused element + 2 levels of context) over WebSocket; full tree available via request.

## Dependencies

```
# hands/requirements.txt additions
pywinauto>=0.6.8;sys_platform=='win32'          # Windows UIAutomation
pyobjc-framework-ApplicationServices>=10.0;sys_platform=='darwin'  # macOS Accessibility
# pyatspi2 — installed via system package manager on Linux (apt install python3-pyatspi)
pytesseract>=0.3.10                              # Local OCR fallback
mss>=9.0                                         # Fast screenshots (already listed)
```

## Task Assignment

| File | Owner | Why |
|------|-------|-----|
| `hands/accessibility/__init__.py` | **Claude** | Platform dispatch + fallback logic — cross-module reasoning |
| `hands/accessibility/types.py` | **Claude** | Data contract everything else depends on |
| `hands/accessibility/fusion.py` | **Claude** | Merge strategy requires spatial reasoning about tree overlap |
| `hands/accessibility/windows.py` | **Codex** | Pattern-following: walk UIAutomation tree, map to UIElement |
| `hands/accessibility/macos.py` | **Codex** | Pattern-following: walk AXUIElement tree, map to UIElement |
| `hands/accessibility/linux.py` | **Codex** | Pattern-following: walk AT-SPI tree, map to UIElement |
| `hands/accessibility/vision.py` | **Codex** | OCR + screenshot — straightforward spec |

## Build Timeline

- **Phase 3 (Day 5)**: Claude writes `types.py` + `__init__.py` + `fusion.py`. Codex writes `windows.py` (primary dev platform). Vision fallback already exists.
- **Phase 5 (Day 7)**: Test on Windows. macOS + Linux backends are v0.2 but the interface is ready.
- **v0.2 (post-demo)**: Codex writes `macos.py` + `linux.py`. Full cross-platform coverage.

## Why This Is The Moat

| Competitor | Accessibility | Vision | Cross-Platform | Fusion |
|-----------|--------------|--------|----------------|--------|
| **OpenClaw** | macOS only | No | No | No |
| **Generic AI agents** | No | Screenshot + GPT-4V | Some | No |
| **Parix** | Win + Mac + Linux | mss + Tesseract/Gemini | Yes | **Yes — structured + visual merged** |

OpenClaw reads the screen like a DOM. Generic agents read it like a photograph. **Parix reads it like both** — and that's something nobody else does.
