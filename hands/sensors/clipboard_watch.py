from __future__ import annotations

import asyncio
import json
import re
import subprocess
import sys
import time
from collections.abc import Callable

import websockets

from hands.protocol import SensorEvent

SYNAPSE_URL = "ws://localhost:8765"

SENSITIVE_PATTERNS = {
    "api_key": re.compile(r"\b(?:sk-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{20,})\b"),
    "github_token": re.compile(r"\bghp_[A-Za-z0-9_]{20,}\b"),
    "aws_access_key": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    "password": re.compile(r"(?i)\b(password|passwd|pwd)\s*[:=]\s*\S{6,}"),
    "token": re.compile(r"(?i)\b(token|secret)\s*[:=]\s*[A-Za-z0-9_.-]{12,}"),
}


def detect_sensitive_clipboard(text: str) -> SensorEvent | None:
    matches = [name for name, pattern in SENSITIVE_PATTERNS.items() if pattern.search(text)]
    if not matches:
        return None
    return SensorEvent(
        event_type="clipboard_sensitive_data",
        data={"matches": matches, "length": len(text)},
        confidence=0.9,
        timestamp=time.time(),
    )


def poll_clipboard_once(reader: Callable[[], str] | None = None) -> SensorEvent | None:
    read = reader or read_clipboard
    try:
        return detect_sensitive_clipboard(read())
    except Exception:
        return None


def to_message(event: SensorEvent) -> dict[str, object]:
    return {
        "type": "SENSOR_EVENT",
        "event_type": event.event_type,
        "data": event.data,
        "confidence": event.confidence,
        "timestamp": event.timestamp,
    }


async def watch_clipboard(interval_seconds: float = 5.0, url: str = SYNAPSE_URL) -> None:
    last_text = ""
    async with websockets.connect(url) as ws:
        while True:
            text = read_clipboard()
            if text and text != last_text:
                last_text = text
                event = detect_sensitive_clipboard(text)
                if event is not None:
                    await ws.send(json.dumps(to_message(event)))
            await asyncio.sleep(interval_seconds)


def read_clipboard() -> str:
    try:
        import pyperclip

        return str(pyperclip.paste() or "")
    except ImportError:
        pass

    if sys.platform == "darwin":
        return _run(["pbpaste"])
    if sys.platform.startswith("linux"):
        for cmd in (["wl-paste"], ["xclip", "-selection", "clipboard", "-o"], ["xsel", "--clipboard", "--output"]):
            text = _run(cmd)
            if text:
                return text
    if sys.platform == "win32":
        return _run(["powershell", "-NoProfile", "-Command", "Get-Clipboard"])
    return ""


def _run(cmd: list[str]) -> str:
    try:
        result = subprocess.run(cmd, check=False, capture_output=True, text=True, timeout=2)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return ""
    return result.stdout.strip()
