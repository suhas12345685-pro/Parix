"""Vision executor — screenshot capture via mss.

Only triggered by Council, not running constantly.
Returns raw PNG bytes or a base64-encoded string for transport.
"""

from __future__ import annotations

import asyncio
import base64
import io
import time
from typing import Any


def capture_screenshot(monitor_index: int = 1) -> bytes:
    import mss
    import mss.tools

    with mss.mss() as sct:
        monitors = sct.monitors
        idx = monitor_index if monitor_index < len(monitors) else 0
        shot = sct.grab(monitors[idx])
        png_buf = io.BytesIO()
        png_bytes = mss.tools.to_png(shot.rgb, shot.size)
        return png_bytes


def capture_screenshot_b64(monitor_index: int = 1) -> str:
    raw = capture_screenshot(monitor_index)
    return base64.b64encode(raw).decode("ascii")


async def capture_async(monitor_index: int = 1) -> bytes:
    return await asyncio.to_thread(capture_screenshot, monitor_index)


async def execute(payload: dict[str, Any]) -> dict[str, Any]:
    monitor = payload.get("monitor", 1)
    try:
        b64 = await asyncio.to_thread(capture_screenshot_b64, monitor)
        return {
            "success": True,
            "output": b64,
            "format": "png_base64",
            "timestamp": time.time(),
            "error": None,
        }
    except ImportError:
        return {"success": False, "error": "mss not installed", "output": ""}
    except Exception as e:
        return {"success": False, "error": str(e), "output": ""}
