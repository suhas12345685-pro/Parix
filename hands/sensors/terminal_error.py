from __future__ import annotations

import re
import asyncio
import json
import time
from collections.abc import Iterable
from typing import Any

import websockets

from hands.protocol import SensorEvent

SYNAPSE_URL = "ws://localhost:8765"

ERROR_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in [
        r"\berror:",
        r"\bERR!",
        r"\btraceback\b",
        r"\bsegfault\b",
        r"\bFAILED\b",
        r"\bexception\b",
    ]
]


def detect_terminal_error(output: str) -> SensorEvent | None:
    matches = [pattern.pattern for pattern in ERROR_PATTERNS if pattern.search(output)]
    if not matches:
        return None
    confidence = min(1.0, 0.55 + (0.1 * len(matches)))
    return SensorEvent(
        event_type="terminal_error",
        data={"output": output[-4000:], "matches": matches},
        confidence=confidence,
        timestamp=time.time(),
    )


def events_from_chunks(chunks: Iterable[str]) -> list[SensorEvent]:
    return [event for chunk in chunks if (event := detect_terminal_error(chunk)) is not None]


def to_message(event: SensorEvent) -> dict[str, Any]:
    return {
        "type": "SENSOR_EVENT",
        "event_type": event.event_type,
        "data": event.data,
        "confidence": event.confidence,
        "timestamp": event.timestamp,
    }


async def watch_command(command: list[str], url: str = SYNAPSE_URL) -> int:
    process = await asyncio.create_subprocess_exec(
        *command,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    async with websockets.connect(url) as ws:
        async def consume(stream: asyncio.StreamReader | None) -> None:
            if stream is None:
                return
            while line := await stream.readline():
                event = detect_terminal_error(line.decode(errors="replace"))
                if event is not None:
                    await ws.send(json.dumps(to_message(event)))

        await asyncio.gather(consume(process.stdout), consume(process.stderr))
        return await process.wait()


async def send_event(event: SensorEvent, url: str = SYNAPSE_URL) -> None:
    async with websockets.connect(url) as ws:
        await ws.send(json.dumps(to_message(event)))
