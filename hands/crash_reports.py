"""Crash report capture for Hands.

Reports are always queued locally. Upload is opt-in and only runs when the
profile telemetry contract is enabled and PARIX_CRASH_REPORT_ENDPOINT is set.
"""

from __future__ import annotations

import asyncio
import json
import os
import platform
import sys
import threading
import time
import traceback
import urllib.request
import uuid
from pathlib import Path
from typing import Any


def install_crash_reporter(loop: asyncio.AbstractEventLoop | None = None) -> None:
    sys.excepthook = _handle_unhandled_exception
    if hasattr(threading, "excepthook"):
        threading.excepthook = _handle_thread_exception  # type: ignore[assignment]
    if loop is not None:
        loop.set_exception_handler(_handle_asyncio_exception)


def capture_crash(
    error: BaseException | str,
    *,
    kind: str = "manual",
    context: dict[str, Any] | None = None,
) -> None:
    report = _build_report(error, kind=kind, context=context or {})
    _write_local_report(report)
    if report["telemetry_enabled"]:
        _upload_report(report)


def _handle_unhandled_exception(
    exc_type: type[BaseException],
    exc: BaseException,
    tb: Any,
) -> None:
    report = _build_report(
        exc,
        kind="uncaught_exception",
        context={"phase": "runtime", "fatal": True},
        traceback_text="".join(traceback.format_exception(exc_type, exc, tb)),
    )
    _write_local_report(report)
    if report["telemetry_enabled"]:
        _upload_report(report)
    sys.__excepthook__(exc_type, exc, tb)


def _handle_thread_exception(args: threading.ExceptHookArgs) -> None:
    report = _build_report(
        args.exc_value or "unknown thread exception",
        kind="thread_exception",
        context={"phase": "thread", "fatal": True, "thread": args.thread.name if args.thread else None},
        traceback_text="".join(
            traceback.format_exception(args.exc_type, args.exc_value, args.exc_traceback)
        ),
    )
    _write_local_report(report)
    if report["telemetry_enabled"]:
        _upload_report(report)


def _handle_asyncio_exception(
    _loop: asyncio.AbstractEventLoop,
    context: dict[str, Any],
) -> None:
    exc = context.get("exception")
    message = str(context.get("message", "asyncio exception"))
    capture_crash(
        exc if isinstance(exc, BaseException) else message,
        kind="asyncio_exception",
        context={"phase": "asyncio", "fatal": False},
    )


def _build_report(
    error: BaseException | str,
    *,
    kind: str,
    context: dict[str, Any],
    traceback_text: str | None = None,
) -> dict[str, Any]:
    message = str(error)
    stack = traceback_text
    if stack is None and isinstance(error, BaseException):
        stack = "".join(traceback.format_exception(type(error), error, error.__traceback__))

    return {
        "id": str(uuid.uuid4()),
        "component": "hands",
        "kind": kind,
        "message": _truncate(message, 1000),
        "stack": _truncate(stack, 8000) if stack else None,
        "context": _sanitize_context(context),
        "telemetry_enabled": _telemetry_enabled(),
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "runtime": {
            "python": platform.python_version(),
            "platform": sys.platform,
            "machine": platform.machine(),
        },
    }


def _write_local_report(report: dict[str, Any]) -> None:
    try:
        path = _parix_home() / "crash-reports" / "hands.jsonl"
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(report, sort_keys=True) + "\n")
    except Exception:
        pass


def _upload_report(report: dict[str, Any]) -> None:
    endpoint = os.getenv("PARIX_CRASH_REPORT_ENDPOINT")
    if not endpoint:
        return
    try:
        body = json.dumps(report).encode("utf-8")
        req = urllib.request.Request(
            endpoint,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=3):
            pass
    except Exception:
        pass


def _telemetry_enabled() -> bool:
    try:
        profile_path = _parix_home() / "profile.json"
        if not profile_path.exists():
            return False
        profile = json.loads(profile_path.read_text(encoding="utf-8"))
        telemetry = profile.get("telemetry") or {}
        return bool(telemetry.get("enabled") and telemetry.get("consentedAt"))
    except Exception:
        return False


def _parix_home() -> Path:
    raw = os.getenv("PARIX_HOME")
    if raw:
        return Path(raw)
    return Path.home() / ".parix"


def _sanitize_context(context: dict[str, Any]) -> dict[str, Any]:
    safe: dict[str, Any] = {}
    for key, value in context.items():
        if any(term in key.lower() for term in ("token", "secret", "key", "password")):
            continue
        if isinstance(value, (str, int, float, bool)) or value is None:
            safe[key] = _truncate(value, 500) if isinstance(value, str) else value
        else:
            safe[key] = "[redacted-object]"
    return safe


def _truncate(value: str, limit: int) -> str:
    return value if len(value) <= limit else value[:limit] + "..."
