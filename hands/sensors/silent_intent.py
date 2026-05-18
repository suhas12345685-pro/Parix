from __future__ import annotations

import asyncio
import json
import time
from typing import Any

import websockets

from hands.accessibility.types import AccessibilitySnapshot, UIElement
from hands.protocol import SilentIntentEvent

SYNAPSE_URL = "ws://localhost:8765"

def detect_idle_shutdown(idle_seconds: float, battery_percent: float | None) -> SilentIntentEvent | None:
    if battery_percent is None:
        return None
    if idle_seconds >= 1800 and battery_percent < 20:
        return SilentIntentEvent(
            intent_type="idle_shutdown",
            data={"idle_seconds": idle_seconds, "battery_percent": battery_percent},
            confidence=0.8,
            timestamp=time.time(),
        )
    return None


def detect_tab_overload(snapshot: AccessibilitySnapshot, threshold: int = 30) -> SilentIntentEvent | None:
    tab_count = _count_tabs(snapshot.tree)
    if tab_count <= threshold:
        return None
    return SilentIntentEvent(
        intent_type="tab_overload",
        data={"tab_count": tab_count, "focused_app": snapshot.focused_app},
        confidence=min(1.0, 0.6 + ((tab_count - threshold) / 100)),
        timestamp=time.time(),
    )


def to_message(event: SilentIntentEvent) -> dict[str, Any]:
    return {
        "type": "SILENT_INTENT_EVENT",
        "intent_type": event.intent_type,
        "data": event.data,
        "confidence": event.confidence,
        "timestamp": event.timestamp,
    }


async def send_event(event: SilentIntentEvent, url: str = SYNAPSE_URL) -> None:
    async with websockets.connect(url) as ws:
        await ws.send(json.dumps(to_message(event)))


async def monitor_idle_shutdown(
    idle_seconds_reader,
    battery_percent_reader,
    interval_seconds: float = 60.0,
    url: str = SYNAPSE_URL,
) -> None:
    async with websockets.connect(url) as ws:
        while True:
            event = detect_idle_shutdown(float(idle_seconds_reader()), battery_percent_reader())
            if event is not None:
                await ws.send(json.dumps(to_message(event)))
            await asyncio.sleep(interval_seconds)


def _count_tabs(element: UIElement) -> int:
    total = 1 if element.role.lower() in {"tab", "pagetab", "page tab"} else 0
    return total + sum(_count_tabs(child) for child in element.children)
