"""
Crash reporter — captures uncaught exceptions and asyncio task failures.

Privacy contract (matches docs/privacy.md):
  - No-op unless ~/.parix/profile.json has telemetry.enabled == true AND
    telemetry.consentedAt is a real ISO timestamp.
  - No-op unless PARIX_CRASH_DSN env var is set OR profile.telemetry.endpoint
    is configured.
  - Payload: error class, message, traceback (truncated), Parix version, OS,
    Python version, process name. No user content.

Wire-up:
    from hands.diagnostics import init_crash_reporter
    init_crash_reporter("hands")
"""

from __future__ import annotations

import json
import logging
import os
import platform as _platform
import sys
import threading
import traceback
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger("hands.crash_reporter")

_initialized = False
_process_name = "hands"
_PROFILE_PATH = Path(os.getenv("PARIX_PROFILE_PATH",
                               str(Path.home() / ".parix" / "profile.json")))
_VERSION = os.getenv("PARIX_VERSION", "unknown")


def _load_profile_telemetry() -> dict[str, Any]:
    """Best-effort read of profile.telemetry. Returns {} on any failure."""
    try:
        with _PROFILE_PATH.open("r", encoding="utf-8") as f:
            data = json.load(f)
        tel = data.get("telemetry")
        if isinstance(tel, dict):
            return tel
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        pass
    return {}


def _endpoint() -> str | None:
    from_env = os.getenv("PARIX_CRASH_DSN", "").strip()
    if from_env:
        return from_env
    tel = _load_profile_telemetry()
    endpoint = tel.get("endpoint")
    if isinstance(endpoint, str) and endpoint.strip():
        return endpoint.strip()
    return None


def _consented() -> bool:
    tel = _load_profile_telemetry()
    return bool(tel.get("enabled") is True and tel.get("consentedAt"))


def _build_payload(exc: BaseException, fatal: bool) -> dict[str, Any]:
    tb = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
    return {
        "process": _process_name,
        "version": _VERSION,
        "ts": datetime.now(timezone.utc).isoformat(),
        "os": _platform.system().lower(),
        "arch": _platform.machine(),
        "pythonVersion": _platform.python_version(),
        "errorClass": type(exc).__name__,
        "errorMessage": (str(exc) or "")[:1000],
        "stack": tb[:4000],
        "fatal": fatal,
    }


def _post_async(payload: dict[str, Any]) -> None:
    """Fire-and-forget POST on a daemon thread (no asyncio dep)."""
    endpoint = _endpoint()
    if not endpoint or not _consented():
        return

    def _post() -> None:
        try:
            req = urllib.request.Request(
                endpoint,
                data=json.dumps(payload).encode("utf-8"),
                headers={"content-type": "application/json"},
                method="POST",
            )
            urllib.request.urlopen(req, timeout=2.0).read()
        except (urllib.error.URLError, OSError, TimeoutError):
            # Crash reporter must never raise. Stay silent.
            pass

    t = threading.Thread(target=_post, daemon=True)
    t.start()


def report_error(exc: BaseException, context: str | None = None) -> None:
    """Manually report a non-fatal error (e.g. from a catch block)."""
    payload = _build_payload(exc, fatal=False)
    if context:
        payload["errorMessage"] = f"{context}: {payload['errorMessage']}"
    _post_async(payload)


def init_crash_reporter(process_name: str = "hands") -> None:
    """Install sys.excepthook + asyncio exception handler. Idempotent."""
    global _initialized, _process_name
    if _initialized:
        return
    _initialized = True
    _process_name = process_name

    prev_hook = sys.excepthook

    def _excepthook(exc_type, exc_value, exc_tb):  # type: ignore[no-untyped-def]
        try:
            _post_async(_build_payload(exc_value, fatal=True))
        finally:
            prev_hook(exc_type, exc_value, exc_tb)

    sys.excepthook = _excepthook

    # asyncio loop exception handler — installed lazily, since the loop may
    # not exist yet at import time.
    try:
        import asyncio

        def _install_loop_handler() -> None:
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                return  # no running loop yet; main.py will retry

            def _loop_excepthook(loop, context):  # type: ignore[no-untyped-def]
                exc = context.get("exception")
                if isinstance(exc, BaseException):
                    _post_async(_build_payload(exc, fatal=False))
                logger.error("asyncio exception: %s", context.get("message"))

            loop.set_exception_handler(_loop_excepthook)

        # Schedule installation on the next loop iteration.
        try:
            asyncio.get_event_loop().call_soon(_install_loop_handler)
        except RuntimeError:
            # No loop yet — caller can re-invoke once the loop is running.
            pass
    except ImportError:
        pass

    # Threading exception hook (Python 3.8+).
    def _thread_hook(args: threading.ExceptHookArgs) -> None:
        if args.exc_value is not None:
            _post_async(_build_payload(args.exc_value, fatal=False))
        logger.error(
            "thread exception in %s: %s", args.thread.name, args.exc_value
        )

    threading.excepthook = _thread_hook
