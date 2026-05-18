#!/usr/bin/env python3
"""Probe accessibility API availability on the current platform."""

import platform
import sys

system = platform.system()
print(f"=== Accessibility Probe ({system}) ===\n")

results = {}


def probe_windows():
    try:
        import pywinauto
        results["pywinauto"] = pywinauto.__version__
        print(f"  [OK] pywinauto {pywinauto.__version__}")
    except ImportError:
        results["pywinauto"] = None
        print("  [MISS] pywinauto not installed (pip install pywinauto)")

    try:
        import comtypes
        results["comtypes"] = True
        print(f"  [OK] comtypes available")
    except ImportError:
        results["comtypes"] = None
        print("  [MISS] comtypes not installed")


def probe_macos():
    try:
        import AppKit  # noqa: F401
        results["pyobjc"] = True
        print("  [OK] pyobjc-framework-Cocoa available")
    except ImportError:
        results["pyobjc"] = None
        print("  [MISS] pyobjc not installed")


def probe_linux():
    try:
        import pyatspi  # noqa: F401
        results["pyatspi"] = True
        print("  [OK] pyatspi2 available")
    except ImportError:
        results["pyatspi"] = None
        print("  [MISS] pyatspi2 not installed")


def probe_vision():
    try:
        import mss  # noqa: F401
        results["mss"] = True
        print("  [OK] mss (screenshot capture)")
    except ImportError:
        results["mss"] = None
        print("  [MISS] mss not installed (pip install mss)")

    try:
        import pytesseract
        pytesseract.get_tesseract_version()
        results["tesseract"] = True
        print("  [OK] Tesseract OCR available")
    except Exception:
        results["tesseract"] = None
        print("  [MISS] Tesseract OCR not available")


if system == "Windows":
    probe_windows()
elif system == "Darwin":
    probe_macos()
elif system == "Linux":
    probe_linux()

print("\n  Vision fallback:")
probe_vision()

ok = sum(1 for v in results.values() if v is not None)
print(f"\n  {ok}/{len(results)} components available")
