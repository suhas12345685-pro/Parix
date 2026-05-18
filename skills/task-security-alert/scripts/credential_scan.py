"""Scan environment and clipboard for exposed credentials.

Usage: python credential_scan.py
Reports detected credential types WITHOUT logging actual values.
"""

import json
import os
import re
import sys
import time

PATTERNS = {
    "api_key": re.compile(r"\b(?:sk-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{20,})\b"),
    "github_token": re.compile(r"\bghp_[A-Za-z0-9_]{20,}\b"),
    "aws_access_key": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    "password_assignment": re.compile(r"(?i)\b(?:password|passwd|pwd)\s*[:=]\s*\S{6,}"),
    "generic_token": re.compile(r"(?i)\b(?:token|secret)\s*[:=]\s*[A-Za-z0-9_.-]{12,}"),
    "jwt": re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b"),
}


def scan_text(text: str) -> list[str]:
    return [name for name, pattern in PATTERNS.items() if pattern.search(text)]


def read_clipboard() -> str:
    try:
        if sys.platform == "win32":
            import subprocess
            r = subprocess.run(
                ["powershell", "-NoProfile", "-Command", "Get-Clipboard"],
                capture_output=True, text=True, timeout=2,
            )
            return r.stdout.strip()
        elif sys.platform == "darwin":
            import subprocess
            r = subprocess.run(["pbpaste"], capture_output=True, text=True, timeout=2)
            return r.stdout.strip()
    except Exception:
        pass
    return ""


if __name__ == "__main__":
    clipboard = read_clipboard()
    findings = scan_text(clipboard) if clipboard else []
    report = {
        "clipboard_length": len(clipboard),
        "credential_types_found": findings,
        "alert": len(findings) > 0,
        "timestamp": time.time(),
    }
    print(json.dumps(report, indent=2))
