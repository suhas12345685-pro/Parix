"""Accessibility poller — continuously snapshots the focused UI element.

Runs as a background async task inside the Hands process. On each cycle:
  1. Asks the AccessibilityBridge for a snapshot (auto mode — native first,
     vision fallback).
  2. Computes a stable fingerprint of the snapshot.
  3. If the fingerprint matches the last one, suppresses the send (debounce —
     UI focus didn't change).
  4. Otherwise emits an ACCESSIBILITY_SNAPSHOT message over the synapse
     WebSocket with the compact summary form.

This is the "camera shutter" the engine has been missing.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from dataclasses import asdict
from typing import Any, Awaitable, Callable

from hands.accessibility import AccessibilityBridge
from hands.accessibility.types import AccessibilitySnapshot
from hands.accessibility.vision import SynapseVisionOcrClient, VisionBackend
from hands.protocol import AccessibilitySnapshotEvent

logger = logging.getLogger("hands.a11y_poller")

DEFAULT_INTERVAL_S = 1.0  # tick rate ceiling — actual send is fingerprint-gated
MIN_INTERVAL_S = 0.2  # never poll faster than 5 Hz, even if config asks


class AccessibilityPoller:
    """Polls AccessibilityBridge and emits change-only snapshots.

    Caller wires a send coroutine: `send(payload: dict) -> None`. The payload
    is the AccessibilitySnapshotEvent rendered as a plain dict, ready to be
    JSON-serialized into the synapse message envelope.
    """

    def __init__(
        self,
        send: Callable[[dict[str, Any]], Awaitable[None]],
        *,
        bridge: AccessibilityBridge | None = None,
        interval_s: float = DEFAULT_INTERVAL_S,
        mode: str = "auto",
    ) -> None:
        self._send = send
        self._bridge = bridge or AccessibilityBridge()
        self._interval_s = max(MIN_INTERVAL_S, interval_s)
        self._mode = mode
        self._last_fingerprint: str | None = None
        self._last_focused_app: str | None = None
        self._stop_event = asyncio.Event()
        self._task: asyncio.Task[None] | None = None

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._stop_event.clear()
            self._task = asyncio.create_task(self._run())
            logger.info(
                "Accessibility poller started (mode=%s, interval=%.2fs, native_available=%s)",
                self._mode,
                self._interval_s,
                self._bridge.is_native_available(),
            )

    async def stop(self) -> None:
        self._stop_event.set()
        if self._task is not None:
            try:
                await asyncio.wait_for(self._task, timeout=2.0)
            except asyncio.TimeoutError:
                self._task.cancel()
        self._task = None

    async def _run(self) -> None:
        while not self._stop_event.is_set():
            try:
                snapshot = await self._bridge.snapshot(mode=self._mode)
                await self._maybe_send(snapshot)
            except Exception as exc:  # don't let one bad tick kill the loop
                logger.warning("Accessibility poller tick failed: %s", exc)

            try:
                await asyncio.wait_for(
                    self._stop_event.wait(), timeout=self._interval_s
                )
                # if wait completed without timeout, stop was requested
                return
            except asyncio.TimeoutError:
                pass  # normal tick — fall through to next iteration

    async def _maybe_send(self, snapshot: AccessibilitySnapshot) -> None:
        fingerprint = snapshot.fingerprint()
        if fingerprint == self._last_fingerprint:
            return  # nothing meaningful changed
        prev_app = self._last_focused_app
        self._last_fingerprint = fingerprint
        self._last_focused_app = snapshot.focused_app

        event = AccessibilitySnapshotEvent(
            snapshot_id=str(uuid.uuid4()),
            focused_app=snapshot.focused_app,
            backend_used=snapshot.backend_used,
            tree_summary=snapshot.summarize(child_depth=2),
            confidence=snapshot.confidence,
            timestamp=time.time(),
        )
        try:
            await self._send(asdict(event))
        except Exception as exc:
            logger.warning("Failed to send ACCESSIBILITY_SNAPSHOT: %s", exc)

        # If the focused application changed (not just the focused
        # element within the same app), emit a lightweight SENSOR_EVENT
        # so task-focus-context and other responders can route on it.
        # The accessibility snapshot is a separate, heavier message —
        # this is the small "the user switched apps" pulse.
        if snapshot.focused_app and snapshot.focused_app != prev_app:
            focus_change_event = {
                "type": "SENSOR_EVENT",
                "event_type": "focus_change",
                "data": {
                    "focused_app": snapshot.focused_app,
                    "previous_app": prev_app or "",
                    "backend_used": snapshot.backend_used,
                    "focused_element": (
                        {
                            "role": snapshot.focused_element.role,
                            "name": snapshot.focused_element.name,
                            "state": list(snapshot.focused_element.state),
                        }
                        if snapshot.focused_element is not None
                        else None
                    ),
                },
                "confidence": snapshot.confidence,
                "timestamp": time.time(),
            }
            try:
                await self._send(focus_change_event)
            except Exception as exc:
                logger.warning("Failed to send focus_change SENSOR_EVENT: %s", exc)

    # --- introspection helpers (used by tests) ---

    @property
    def last_fingerprint(self) -> str | None:
        return self._last_fingerprint

    @property
    def last_focused_app(self) -> str | None:
        return self._last_focused_app

    def reset_fingerprint(self) -> None:
        self._last_fingerprint = None
        self._last_focused_app = None


def make_synapse_sender(
    send_json: Callable[[str], Awaitable[None]],
) -> Callable[[dict[str, Any]], Awaitable[None]]:
    """Convenience: wrap a websocket-send-text callable into a poller sender.

    The synapse message format is `{ "type": "ACCESSIBILITY_SNAPSHOT", ...fields }`.
    """

    async def _send(payload: dict[str, Any]) -> None:
        envelope = {"type": "ACCESSIBILITY_SNAPSHOT", **payload}
        await send_json(json.dumps(envelope))

    return _send


async def run_loop(
    url: str,
    *,
    interval_s: float = DEFAULT_INTERVAL_S,
    mode: str = "auto",
    bridge: AccessibilityBridge | None = None,
) -> None:
    """Connect to the synapse websocket and feed snapshots over it forever.

    Mirrors the pattern of `hands/sensors/watcher.py`: open a websocket,
    instantiate the poller pointing at it, and tick until cancelled. On
    disconnect, loops and reconnects after a backoff.
    """
    import websockets  # local import — only needed when used as a runtime

    backoff_s = 1.0
    while True:
        try:
            async with websockets.connect(url) as ws:
                logger.info("Accessibility poller connected to %s", url)
                backoff_s = 1.0

                async def _send_json(text: str) -> None:
                    await ws.send(text)

                vision_ocr = SynapseVisionOcrClient(_send_json)
                sender = make_synapse_sender(_send_json)
                active_bridge = bridge or AccessibilityBridge(
                    vision=VisionBackend(ocr_client=vision_ocr)
                )
                poller = AccessibilityPoller(
                    sender, bridge=active_bridge, interval_s=interval_s, mode=mode
                )
                poller.start()
                try:
                    # Poller sends OCR requests on this websocket; this loop
                    # receives the matching VISION_OCR_RESPONSE messages.
                    async for raw in ws:
                        vision_ocr.handle_raw(raw)
                finally:
                    vision_ocr.cancel_pending()
                    await poller.stop()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning(
                "Accessibility poller WS error, reconnecting in %.1fs: %s",
                backoff_s,
                exc,
            )
            await asyncio.sleep(backoff_s)
            backoff_s = min(backoff_s * 2.0, 30.0)
