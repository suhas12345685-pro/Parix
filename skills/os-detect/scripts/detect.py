#!/usr/bin/env python3
"""Parix platform detection script.

Detects OS, architecture, container environment, and available capabilities.
Outputs a JSON report suitable for skill routing.
"""

import json
import os
import platform
import shutil
import sys


def detect_platform():
    """Return a full platform detection report as a dict."""
    info = {
        "platform": sys.platform,
        "arch": platform.machine(),
        "release": platform.release(),
        "python_version": platform.python_version(),
        "is_docker": (
            os.path.exists("/.dockerenv")
            or os.path.exists("/run/.containerenv")
        ),
        "hostname": platform.node(),
    }

    # Determine which skill to load
    if info["is_docker"]:
        info["skill"] = "os-docker"
    elif sys.platform == "win32":
        info["skill"] = "os-windows"
    elif sys.platform == "darwin":
        info["skill"] = "os-macos"
    elif sys.platform.startswith("linux"):
        info["skill"] = "os-linux"
        info["distro"] = _detect_linux_distro()
    else:
        info["skill"] = "unknown"

    # Probe available capabilities
    info["capabilities"] = {
        "clipboard": _probe_clipboard(),
        "screenshot": _probe_screenshot(),
        "notifications": _probe_notifications(),
        "package_manager": _detect_package_manager(),
    }

    return info


def _detect_linux_distro():
    """Read /etc/os-release to identify the Linux distribution."""
    try:
        with open("/etc/os-release") as f:
            for line in f:
                if line.startswith("ID="):
                    return line.strip().split("=", 1)[1].strip('"')
    except FileNotFoundError:
        pass
    return "unknown"


def _probe_clipboard():
    """Check if a clipboard tool is available."""
    tools = {
        "win32": ["powershell"],
        "darwin": ["pbcopy"],
        "linux": ["xclip", "wl-copy"],
    }
    for tool in tools.get(sys.platform, []):
        if shutil.which(tool):
            return tool
    return None


def _probe_screenshot():
    """Check if a screenshot tool is available."""
    tools = {
        "win32": ["powershell"],
        "darwin": ["screencapture"],
        "linux": ["scrot", "grim", "gnome-screenshot"],
    }
    for tool in tools.get(sys.platform, []):
        if shutil.which(tool):
            return tool
    return None


def _probe_notifications():
    """Check if a notification tool is available."""
    tools = {
        "darwin": ["osascript"],
        "linux": ["notify-send"],
    }
    if sys.platform == "win32":
        return "snoretoast"
    for tool in tools.get(sys.platform, []):
        if shutil.which(tool):
            return tool
    return None


def _detect_package_manager():
    """Detect the available package manager."""
    managers = {
        "win32": ["winget", "choco", "scoop"],
        "darwin": ["brew"],
        "linux": ["apt", "dnf", "pacman", "zypper"],
    }
    for mgr in managers.get(sys.platform, []):
        if shutil.which(mgr):
            return mgr
    return None


if __name__ == "__main__":
    report = detect_platform()
    print(json.dumps(report, indent=2))
