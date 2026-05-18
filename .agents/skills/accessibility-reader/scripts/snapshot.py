"""Capture an accessibility snapshot and print the element tree.

Usage: python snapshot.py [--mode auto|accessibility|vision|fused]
"""

import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from hands.accessibility import AccessibilityBridge
from hands.accessibility.types import UIElement


def tree_to_dict(el: UIElement, depth: int = 0, max_depth: int = 4) -> dict:
    d = {"role": el.role, "name": el.name}
    if el.value:
        d["value"] = el.value
    if el.bounds:
        d["bounds"] = list(el.bounds)
    if depth < max_depth and el.children:
        d["children"] = [tree_to_dict(c, depth + 1, max_depth) for c in el.children]
    return d


async def main():
    mode = "auto"
    if "--mode" in sys.argv:
        idx = sys.argv.index("--mode")
        mode = sys.argv[idx + 1] if idx + 1 < len(sys.argv) else "auto"

    bridge = AccessibilityBridge()
    snap = await bridge.snapshot(mode=mode)
    report = {
        "focused_app": snap.focused_app,
        "backend": snap.backend_used,
        "confidence": snap.confidence,
        "tree": tree_to_dict(snap.tree),
    }
    print(json.dumps(report, indent=2, default=str))


if __name__ == "__main__":
    asyncio.run(main())
