"""Run a computer-use task via the vision agent.

Usage: python run_task.py "Open Notepad and type Hello World"

Requires: mss, Pillow, websockets, and a running LLM provider.
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from hands.vision.agent import run_vision_agent


class MockLLM:
    """Stub LLM for dry-run testing — always returns done."""
    async def vision_complete(self, image_b64: str, prompt: str) -> str:
        print(f"[MockLLM] Received screenshot ({len(image_b64)} bytes b64)")
        print(f"[MockLLM] Prompt:\n{prompt[:500]}")
        return '{"action": "done", "reason": "dry run complete"}'


async def main():
    goal = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else "describe what you see on screen"
    print(f"Goal: {goal}")
    steps = await run_vision_agent(goal=goal, llm=MockLLM(), max_steps=3)
    for step in steps:
        print(json.dumps({
            "step": step.step,
            "action": step.action_taken.action if step.action_taken else None,
            "reason": step.action_taken.reason if step.action_taken else None,
            "result": step.result,
            "error": step.error,
        }, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
