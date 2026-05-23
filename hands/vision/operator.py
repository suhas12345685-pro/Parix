"""Screen operator entry point.

Bridges the dormant vision agent loop (hands/vision/agent.py) to the live
system: per-step vision reasoning is routed to Atrium's LLM router (whichever
multimodal provider the user configured) via the existing VISION_OCR_REQUEST /
VISION_OCR_RESPONSE round-trip, and actions are executed through UIAutomation.

This is what makes Parix a real operator: given a goal, it sees the screen,
decides, and acts — repeating until done or the step cap.
"""

from __future__ import annotations

import asyncio
import json
import time
import uuid
from typing import Any, Awaitable, Callable

from hands.vision.agent import run_vision_agent

# How long to wait for a single step's vision LLM response before giving up
# on that step (the agent treats an empty response as a failed step).
STEP_VISION_TIMEOUT_S = 45.0


class SynapseVisionProvider:
    """LLMVisionProvider that routes each step to Atrium over synapse.

    `send_json` sends a raw JSON string to the Atrium connection; `pending`
    is a shared registry (request_id -> Future) that main.py resolves when the
    matching VISION_OCR_RESPONSE arrives.
    """

    def __init__(
        self,
        send_json: Callable[[str], Awaitable[None]],
        pending: dict[str, "asyncio.Future[dict[str, Any]]"],
        *,
        timeout_s: float = STEP_VISION_TIMEOUT_S,
    ) -> None:
        self._send_json = send_json
        self._pending = pending
        self._timeout_s = timeout_s

    async def vision_complete(self, image_b64: str, prompt: str) -> str:
        request_id = str(uuid.uuid4())
        loop = asyncio.get_running_loop()
        future: asyncio.Future[dict[str, Any]] = loop.create_future()
        self._pending[request_id] = future

        envelope = {
            "type": "VISION_OCR_REQUEST",
            "request_id": request_id,
            "prompt": prompt,
            "image_b64": image_b64,
            "mime_type": "image/png",
            "timestamp": time.time(),
        }

        try:
            await self._send_json(json.dumps(envelope))
            response = await asyncio.wait_for(future, timeout=self._timeout_s)
        except asyncio.TimeoutError:
            return ""
        except Exception:
            return ""
        finally:
            self._pending.pop(request_id, None)

        if response.get("error"):
            return ""
        return str(response.get("text") or "")


def _summarize(steps: list) -> str:
    if not steps:
        return "No steps were taken."
    lines = []
    for s in steps:
        action = s.action_taken
        detail = f"#{getattr(action, 'element_id', '')}".strip("#")
        verb = action.action
        note = action.reason or s.result or ""
        lines.append(f"step {s.step}: {verb} {detail} — {note}".strip())
    return "\n".join(lines)


async def run_operator(
    goal: str,
    send_json: Callable[[str], Awaitable[None]],
    pending: dict[str, "asyncio.Future[dict[str, Any]]"],
) -> dict[str, Any]:
    """Run the operator loop for `goal` and return a TASK_RESULT-shaped dict."""
    provider = SynapseVisionProvider(send_json, pending)
    try:
        steps = await run_vision_agent(goal, provider)
    except Exception as exc:  # noqa: BLE001 — surface any loop failure as a result
        return {"success": False, "output": "", "error": f"operator error: {exc}"}

    last = steps[-1] if steps else None
    succeeded = bool(last and last.action_taken.action == "done")
    return {
        "success": succeeded,
        "output": _summarize(steps),
        "error": None if succeeded else (last.error if last else "no steps taken"),
    }
