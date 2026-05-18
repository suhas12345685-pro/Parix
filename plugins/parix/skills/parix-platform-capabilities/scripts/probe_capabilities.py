"""Probe Parix platform capabilities and report results.

Runs side-effect-free checks for accessibility, screenshot, clipboard,
notifications, and package_manager on the current OS.
"""
from __future__ import annotations

import importlib
import platform
import shutil
import json
import sys


def _os_name() -> str:
    if shutil.which("docker") and platform.system() == "Linux":
        from pathlib import Path
        if Path("/.dockerenv").exists():
            return "docker"
    return {"Windows": "windows", "Darwin": "macos", "Linux": "linux"}.get(
        platform.system(), "linux"
    )


def _check_import(module: str) -> bool:
    try:
        importlib.import_module(module)
        return True
    except ImportError:
        return False


def _probe_accessibility(os_name: str) -> bool:
    if os_name == "windows":
        return _check_import("pywinauto")
    if os_name == "macos":
        return _check_import("ApplicationServices")
    if os_name == "linux":
        return _check_import("pyatspi") or _check_import("gi")
    return False


def _probe_screenshot(os_name: str) -> bool:
    if _check_import("mss"):
        return True
    bins = {"macos": "screencapture", "linux": "grim"}
    return shutil.which(bins.get(os_name, "")) is not None


def _probe_clipboard(os_name: str) -> bool:
    if _check_import("pyperclip"):
        return True
    fallbacks = {"macos": "pbpaste", "linux": "xclip", "windows": "powershell"}
    return shutil.which(fallbacks.get(os_name, "")) is not None


def _probe_notifications(os_name: str) -> bool:
    if os_name == "docker":
        return False
    bins = {"linux": "notify-send", "macos": "osascript", "windows": "powershell"}
    return shutil.which(bins.get(os_name, "")) is not None


def _probe_package_manager(os_name: str) -> bool:
    candidates = {
        "windows": ["winget", "choco", "scoop"],
        "macos": ["brew", "mas"],
        "linux": ["apt", "dnf", "pacman", "snap", "flatpak"],
        "docker": ["apt", "apk"],
    }
    return any(shutil.which(c) for c in candidates.get(os_name, []))


def main() -> None:
    os_name = _os_name()
    results = {
        "os": os_name,
        "capabilities": {
            "accessibility": _probe_accessibility(os_name),
            "screenshot": _probe_screenshot(os_name),
            "clipboard": _probe_clipboard(os_name),
            "notifications": _probe_notifications(os_name),
            "package_manager": _probe_package_manager(os_name),
        },
    }
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
