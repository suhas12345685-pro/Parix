"""Vision agent loop — screenshot → annotate → LLM → execute → repeat.

This is Parix's "computer use" equivalent. It:
1. Captures a screenshot via mss (read-only, no focus change)
2. Gets the accessibility tree (read-only)
3. Overlays Set-of-Mark numbered badges on interactive elements
4. Sends the annotated screenshot + element list to a vision-capable LLM
5. Parses the LLM's chosen action (click #7, type "hello" in #12, etc.)
6. Executes via UIA programmatic patterns (no mouse movement)
7. Repeats until the LLM says "done" or max steps reached

NO pyautogui. NO mouse movement. NO focus stealing.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any, Protocol

from hands.accessibility import AccessibilityBridge
from hands.vision.actions import ActionExecutor
from hands.vision.marker import build_annotated_screenshot, elements_to_text
from hands.vision.types import AnnotatedScreenshot, VisionAction, VisionStep

logger = logging.getLogger("hands.vision.agent")

MAX_STEPS = 15
STEP_DELAY = 1.0


class LLMVisionProvider(Protocol):
    """Interface for sending annotated screenshots to a vision LLM."""
    async def vision_complete(
        self,
        image_b64: str,
        prompt: str,
    ) -> str:
        ...


SYSTEM_PROMPT = """You are a computer use agent. You can see a screenshot with numbered red badges on interactive UI elements.

You will be given:
1. An annotated screenshot with numbered markers
2. A text list of all interactive elements with their IDs, roles, names, and available actions

Your job: decide what action to take to accomplish the user's goal.

Respond with EXACTLY one JSON object (no markdown, no explanation):

For clicking/invoking a button or link:
{"action": "click", "element_id": 7, "reason": "clicking the Submit button"}

For typing text into an input field:
{"action": "type", "element_id": 12, "text": "hello world", "reason": "entering search query"}

For toggling a checkbox:
{"action": "toggle", "element_id": 3, "reason": "enabling dark mode"}

For selecting a tab or list item:
{"action": "select", "element_id": 5, "reason": "switching to Settings tab"}

For reading an element's value:
{"action": "read", "element_id": 9, "reason": "checking the current status"}

For scrolling:
{"action": "scroll", "element_id": 2, "text": "down", "reason": "scrolling to see more options"}

When the task is complete:
{"action": "done", "reason": "form submitted successfully"}

If the task cannot be completed:
{"action": "fail", "reason": "the target element is not visible on screen"}

Rules:
- Pick EXACTLY one action per turn
- Always include a reason
- Use element IDs from the list, not coordinates
- If you need to scroll to find an element, do that first
- If the screenshot looks unchanged after an action, the action may have failed — try a different approach"""


def parse_llm_response(raw: str) -> VisionAction:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}") + 1
        if start >= 0 and end > start:
            data = json.loads(cleaned[start:end])
        else:
            return VisionAction(action="fail", reason=f"could not parse LLM response: {raw[:200]}")

    return VisionAction(
        action=data.get("action", "fail"),
        element_id=data.get("element_id"),
        text=data.get("text"),
        reason=data.get("reason", ""),
    )


async def capture_annotated(
    a11y_bridge: AccessibilityBridge,
) -> AnnotatedScreenshot:
    """Capture screenshot + accessibility tree → annotated screenshot."""
    import mss
    import mss.tools
    import io

    screenshot_bytes = await asyncio.to_thread(_capture_screen)
    snapshot = await a11y_bridge.snapshot(mode="auto")
    return build_annotated_screenshot(screenshot_bytes, snapshot)


def _capture_screen() -> bytes:
    import mss
    import mss.tools

    with mss.mss() as sct:
        monitors = sct.monitors
        idx = 1 if len(monitors) > 1 else 0
        shot = sct.grab(monitors[idx])
        return mss.tools.to_png(shot.rgb, shot.size)


async def run_vision_agent(
    goal: str,
    llm: LLMVisionProvider,
    *,
    max_steps: int = MAX_STEPS,
    step_delay: float = STEP_DELAY,
) -> list[VisionStep]:
    """Run the vision agent loop until done/fail or max steps."""
    a11y = AccessibilityBridge()
    executor = ActionExecutor()
    steps: list[VisionStep] = []

    logger.info("Vision agent starting: %s", goal)

    for i in range(1, max_steps + 1):
        logger.info("Step %d/%d", i, max_steps)

        annotated = await capture_annotated(a11y)
        element_text = elements_to_text(annotated.elements)

        prompt = f"""{SYSTEM_PROMPT}

Goal: {goal}

Step {i}/{max_steps}. Current app: {annotated.focused_app}

Interactive elements on screen:
{element_text}

What action should I take?"""

        raw_response = await llm.vision_complete(
            image_b64=annotated.image_b64,
            prompt=prompt,
        )

        action = parse_llm_response(raw_response)
        logger.info("LLM chose: %s (element=%s, reason=%s)", action.action, action.element_id, action.reason)

        if action.action in ("done", "fail"):
            steps.append(VisionStep(
                step=i,
                screenshot_b64=annotated.image_b64,
                action_taken=action,
                result=action.reason,
            ))
            logger.info("Vision agent finished: %s — %s", action.action, action.reason)
            break

        result = executor.execute(action, annotated.elements)

        steps.append(VisionStep(
            step=i,
            screenshot_b64=annotated.image_b64,
            action_taken=action,
            result=str(result.get("result", "")),
            error=result.get("error"),
        ))

        if not result.get("success"):
            logger.warning("Action failed: %s", result.get("error"))

        await asyncio.sleep(step_delay)

    return steps
