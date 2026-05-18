"""Capture a screenshot and save to disk.

Usage: python capture.py [output.png]
"""

import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from hands.executor.vision import capture_screenshot

if __name__ == "__main__":
    output = sys.argv[1] if len(sys.argv) > 1 else f"screenshot_{int(time.time())}.png"
    try:
        data = capture_screenshot()
        Path(output).write_bytes(data)
        print(f"Saved: {output} ({len(data)} bytes)")
    except ImportError:
        print("ERROR: mss not installed — pip install mss")
        sys.exit(1)
