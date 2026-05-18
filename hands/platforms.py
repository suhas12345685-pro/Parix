from __future__ import annotations

import importlib.util
import os
import shutil
import struct
import sys
from pathlib import Path


OsName = str
CapabilityName = str


class _PlatformProbe:
    @staticmethod
    def machine() -> str:
        env_arch = (
            os.environ.get("PROCESSOR_ARCHITEW6432")
            or os.environ.get("PROCESSOR_ARCHITECTURE")
            or ""
        )
        if env_arch:
            return env_arch
        try:
            import subprocess

            result = subprocess.run(["uname", "-m"], capture_output=True, text=True, timeout=2)
            return result.stdout.strip()
        except Exception:
            return "x86_64" if struct.calcsize("P") == 8 else "x86"


platform = _PlatformProbe()


def is_docker() -> bool:
    return Path("/.dockerenv").exists() or Path("/run/.containerenv").exists()


def detect_os() -> OsName:
    if is_docker():
        return "docker"
    if sys.platform == "win32":
        return "windows"
    if sys.platform == "darwin":
        return "macos"
    if sys.platform.startswith("linux"):
        return "linux"
    return "linux"


def detect_distro() -> str | None:
    if not sys.platform.startswith("linux"):
        return None

    os_release = Path("/etc/os-release")
    try:
        text = os_release.read_text(encoding="utf-8", errors="ignore")
    except FileNotFoundError:
        return None

    for line in text.splitlines():
        if line.startswith("ID="):
            return line.split("=", 1)[1].strip().strip('"').lower()
    return None


def detect_arch() -> str:
    machine = platform.machine().lower()
    if machine in {"amd64", "x86_64", "x64"}:
        return "x64"
    if machine in {"aarch64", "arm64"}:
        return "arm64"
    return "arm64" if "arm" in machine else "x64"


def probe_capability(name: CapabilityName) -> bool:
    probes = {
        "accessibility": _probe_accessibility,
        "screenshot": _probe_screenshot,
        "clipboard": _probe_clipboard,
        "notifications": _probe_notifications,
        "package_manager": _probe_package_manager,
    }
    probe = probes.get(name)
    return bool(probe and probe())


def _has_module(name: str) -> bool:
    return importlib.util.find_spec(name) is not None


def _has_binary(*names: str) -> bool:
    return any(shutil.which(name) is not None for name in names)


def _probe_accessibility() -> bool:
    os_name = detect_os()
    if os_name == "windows":
        return _has_module("pywinauto")
    if os_name == "macos":
        return _has_module("ApplicationServices")
    if os_name == "linux":
        return _has_module("pyatspi") or _has_module("gi")
    return False


def _probe_screenshot() -> bool:
    os_name = detect_os()
    if _has_module("mss"):
        return True
    if os_name == "windows":
        return True
    if os_name == "macos":
        return _has_binary("screencapture")
    if os_name == "linux":
        return _has_binary("grim", "scrot", "gnome-screenshot")
    return False


def _probe_clipboard() -> bool:
    os_name = detect_os()
    if _has_module("pyperclip"):
        return True
    if os_name == "windows":
        return _has_binary("powershell", "pwsh")
    if os_name == "macos":
        return _has_binary("pbpaste")
    if os_name == "linux":
        return _has_binary("xclip", "xsel", "wl-paste")
    return False


def _probe_notifications() -> bool:
    os_name = detect_os()
    if os_name == "windows":
        return _has_binary("powershell", "pwsh")
    if os_name == "macos":
        return _has_binary("osascript")
    if os_name == "linux":
        return _has_binary("notify-send")
    return bool(os.getenv("PARIX_WEBHOOK_URL") or os.getenv("TELEGRAM_BOT_TOKEN"))


def _probe_package_manager() -> bool:
    os_name = detect_os()
    if os_name == "windows":
        return _has_binary("winget", "choco", "scoop")
    if os_name == "macos":
        return _has_binary("brew", "mas")
    if os_name == "linux":
        return _has_binary("apt", "dnf", "pacman", "snap", "flatpak")
    return _has_binary("apk", "apt", "dnf", "pacman")
