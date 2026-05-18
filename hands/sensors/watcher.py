"""Unified OS watcher — the "Eyes & Ears" of Parix.

Polls active window title and terminal buffer every 2 seconds.
Detects error patterns and fires SENSOR_EVENTs over Synapse.

Runs as a background async task inside the Hands process.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import subprocess
import sys
import time
from typing import Any

import websockets

from hands.protocol import SensorEvent

logger = logging.getLogger("hands.watcher")

SYNAPSE_URL = "ws://localhost:8765"
POLL_INTERVAL = 2.0

# ── Error patterns with severity weights ─────────────────────────────

PATTERNS: list[tuple[re.Pattern[str], float, str]] = [
    (re.compile(r"\btraceback\b", re.IGNORECASE), 0.30, "traceback"),
    (re.compile(r"\bsegfault\b", re.IGNORECASE), 0.35, "segfault"),
    (re.compile(r"\bFAILED\b"), 0.20, "FAILED"),
    (re.compile(r"\berror:", re.IGNORECASE), 0.15, "error:"),
    (re.compile(r"\bERR!"), 0.20, "ERR!"),
    (re.compile(r"\bexception\b", re.IGNORECASE), 0.15, "exception"),
    (re.compile(r"\bpanic\b", re.IGNORECASE), 0.30, "panic"),
    (re.compile(r"\bfatal\b", re.IGNORECASE), 0.25, "fatal"),
    (re.compile(r"\bOOM\b|out of memory", re.IGNORECASE), 0.30, "oom"),
    (re.compile(r"ENOSPC|No space left on device", re.IGNORECASE), 0.25, "disk_full"),
    (re.compile(r"ECONNREFUSED|connection refused", re.IGNORECASE), 0.15, "conn_refused"),
    (re.compile(r"EACCES|permission denied", re.IGNORECASE), 0.15, "perm_denied"),
]

# False-positive suppressors
FALSE_POSITIVE_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"0 error", re.IGNORECASE),
    re.compile(r"no errors?", re.IGNORECASE),
    re.compile(r"error.*(handler|middleware|boundary|page)", re.IGNORECASE),
    re.compile(r"error_log|error_level|error_code", re.IGNORECASE),
    re.compile(r"import.*error|from.*error", re.IGNORECASE),
]


def score_output(text: str) -> tuple[float, list[str]]:
    """Score terminal output for error severity. Returns (confidence, matched_tags)."""
    if not text.strip():
        return 0.0, []

    for fp in FALSE_POSITIVE_PATTERNS:
        if fp.search(text):
            return 0.0, []

    total = 0.0
    tags: list[str] = []
    for pattern, weight, tag in PATTERNS:
        if pattern.search(text):
            total += weight
            tags.append(tag)

    confidence = min(1.0, 0.4 + total) if tags else 0.0
    return confidence, tags


def build_sensor_event(
    text: str,
    confidence: float,
    tags: list[str],
    source: str = "terminal",
    window_title: str | None = None,
) -> SensorEvent:
    data: dict[str, Any] = {
        "output": text[-4000:],
        "matches": tags,
        "source": source,
    }
    if window_title:
        data["window_title"] = window_title
    return SensorEvent(
        event_type="terminal_error",
        data=data,
        confidence=confidence,
        timestamp=time.time(),
    )


def to_message(event: SensorEvent) -> dict[str, Any]:
    return {
        "type": "SENSOR_EVENT",
        "event_type": event.event_type,
        "data": event.data,
        "confidence": event.confidence,
        "timestamp": event.timestamp,
    }


# ── Platform-specific window title reader ────────────────────────────

def get_active_window_title() -> str:
    if sys.platform == "win32":
        return _get_window_title_windows()
    elif sys.platform == "darwin":
        return _get_window_title_macos()
    else:
        return _get_window_title_linux()


def _get_window_title_windows() -> str:
    try:
        import ctypes
        user32 = ctypes.windll.user32  # type: ignore[attr-defined]
        hwnd = user32.GetForegroundWindow()
        length = user32.GetWindowTextLengthW(hwnd)
        if length == 0:
            return ""
        buf = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buf, length + 1)
        return buf.value
    except Exception:
        return ""


def _get_window_title_macos() -> str:
    try:
        result = subprocess.run(
            ["osascript", "-e",
             'tell application "System Events" to get name of first application process whose frontmost is true'],
            capture_output=True, text=True, timeout=2,
        )
        return result.stdout.strip()
    except Exception:
        return ""


def _get_window_title_linux() -> str:
    try:
        result = subprocess.run(
            ["xdotool", "getactivewindow", "getwindowname"],
            capture_output=True, text=True, timeout=2,
        )
        return result.stdout.strip()
    except Exception:
        return ""


# ── Terminal buffer reader ───────────────────────────────────────────

def read_terminal_buffer(max_lines: int = 20) -> str:
    """Read recent terminal output from the OS console buffer."""
    if sys.platform == "win32":
        return _read_terminal_windows(max_lines)
    else:
        return _read_terminal_unix(max_lines)


def _read_terminal_windows(max_lines: int) -> str:
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             f"Get-Content -Path $env:TEMP\\parix_terminal_buffer.log -Tail {max_lines} -ErrorAction SilentlyContinue"],
            capture_output=True, text=True, timeout=3, shell=False,
        )
        if result.stdout.strip():
            return result.stdout.strip()
    except Exception:
        pass

    # Fallback: read from ConHost via doskey /history
    try:
        result = subprocess.run(
            ["cmd", "/c", "doskey", "/history"],
            capture_output=True, text=True, timeout=3, shell=False,
        )
        lines = result.stdout.strip().splitlines()
        return "\n".join(lines[-max_lines:])
    except Exception:
        return ""


def _read_terminal_unix(max_lines: int) -> str:
    # Try reading from a known log file the user may pipe to
    try:
        result = subprocess.run(
            ["tail", "-n", str(max_lines), "/tmp/parix_terminal_buffer.log"],
            capture_output=True, text=True, timeout=2,
        )
        if result.stdout.strip():
            return result.stdout.strip()
    except Exception:
        pass

    # Fallback: read shell history
    try:
        result = subprocess.run(
            ["bash", "-c", f"history | tail -n {max_lines}"],
            capture_output=True, text=True, timeout=2,
        )
        return result.stdout.strip()
    except Exception:
        return ""


# ── Watcher class ────────────────────────────────────────────────────

class Watcher:
    """Stateful watcher that polls the OS and deduplicates events."""

    def __init__(self, poll_interval: float = POLL_INTERVAL) -> None:
        self.poll_interval = poll_interval
        self.last_window_title: str = ""
        self.last_buffer_hash: int = 0
        self.event_count: int = 0

    def poll_once(self) -> list[SensorEvent]:
        events: list[SensorEvent] = []

        window_title = get_active_window_title()
        if window_title != self.last_window_title:
            self.last_window_title = window_title

        buffer_text = read_terminal_buffer()
        buffer_hash = hash(buffer_text)
        if buffer_hash == self.last_buffer_hash or not buffer_text:
            return events
        self.last_buffer_hash = buffer_hash

        confidence, tags = score_output(buffer_text)
        if confidence > 0 and tags:
            event = build_sensor_event(
                buffer_text,
                confidence,
                tags,
                source="terminal",
                window_title=window_title,
            )
            events.append(event)
            self.event_count += 1

        return events


# ── Async run loop ───────────────────────────────────────────────────

async def watch_loop(
    url: str = SYNAPSE_URL,
    poll_interval: float = POLL_INTERVAL,
    max_events: int | None = None,
) -> None:
    """Main watcher loop — connects to Synapse and streams SENSOR_EVENTs."""
    watcher = Watcher(poll_interval)
    logger.info("Watcher starting (poll every %.1fs)", poll_interval)

    while True:
        try:
            async with websockets.connect(url) as ws:
                logger.info("Watcher connected to Synapse at %s", url)
                while True:
                    events = await asyncio.to_thread(watcher.poll_once)
                    for ev in events:
                        await ws.send(json.dumps(to_message(ev)))
                        logger.info(
                            "SENSOR_EVENT sent: %s (confidence=%.2f, tags=%s)",
                            ev.event_type, ev.confidence, ev.data.get("matches"),
                        )
                    if max_events and watcher.event_count >= max_events:
                        logger.info("Max events reached (%d), stopping", max_events)
                        return
                    await asyncio.sleep(poll_interval)
        except (ConnectionRefusedError, OSError) as e:
            logger.warning("Cannot connect to Synapse (%s), retrying in 10s", e)
            await asyncio.sleep(10)
        except websockets.exceptions.ConnectionClosed:
            logger.warning("Synapse connection lost, reconnecting in 5s")
            await asyncio.sleep(5)
