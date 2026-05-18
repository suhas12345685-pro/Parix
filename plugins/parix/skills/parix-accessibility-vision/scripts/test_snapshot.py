"""Test accessibility snapshot capture on the current platform.

Attempts native accessibility first, then vision fallback, and
prints a minimal snapshot to verify the pipeline works.
"""
from __future__ import annotations

import json
import platform
import time
import sys


def _try_native() -> dict | None:
    os_name = platform.system()
    try:
        if os_name == "Windows":
            from pywinauto import Desktop
            desktop = Desktop(backend="uia")
            top = desktop.windows()[0] if desktop.windows() else None
            if top:
                return {"role": "window", "name": top.window_text(), "source": "native"}
        elif os_name == "Darwin":
            import ApplicationServices  # noqa: F401
            return {"role": "window", "name": "(macos-ax)", "source": "native"}
        elif os_name == "Linux":
            import pyatspi  # noqa: F401
            return {"role": "window", "name": "(at-spi2)", "source": "native"}
    except Exception as exc:
        print(f"native unavailable: {exc}", file=sys.stderr)
    return None


def _try_vision() -> dict | None:
    try:
        import mss
        with mss.mss() as sct:
            shot = sct.grab(sct.monitors[1])
            return {
                "role": "screen",
                "name": "vision-capture",
                "bounds": {"w": shot.width, "h": shot.height},
                "source": "vision",
            }
    except Exception as exc:
        print(f"vision unavailable: {exc}", file=sys.stderr)
    return None


def main() -> None:
    ts = time.time()
    native = _try_native()
    vision = _try_vision()
    tree = native or vision
    snapshot = {
        "timestamp": ts,
        "platform": platform.system().lower(),
        "backend_used": (tree or {}).get("source", "none"),
        "focused_app": (tree or {}).get("name"),
        "focused_element": None,
        "tree": [tree] if tree else [],
        "raw_text": None,
        "confidence": 0.9 if native else (0.5 if vision else 0.0),
    }
    print(json.dumps(snapshot, indent=2))
    if not tree:
        print("warning: no backend available", file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
