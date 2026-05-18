---
name: screen-capture
description: Capture screenshots via mss — read-only, no focus change, fast.
---

# Screen Capture

> Use when the agent needs a screenshot for vision analysis, monitoring, or logging.

## Usage

```python
from hands.executor.vision import capture_screenshot, capture_screenshot_b64, execute

# Raw PNG bytes
png_bytes = capture_screenshot(monitor_index=1)

# Base64-encoded for transport/LLM
b64_str = capture_screenshot_b64(monitor_index=1)

# Via Synapse TASK_REQUEST
result = await execute({"monitor": 1})
# result = {"success": True, "output": "<base64>", "format": "png_base64"}
```

## Why mss (not pyautogui)

| | mss | pyautogui |
|---|---|---|
| Focus | Never touches focus | Steals focus |
| Speed | ~20ms per capture | ~100ms |
| Multi-monitor | Yes (monitor_index) | Partial |
| Dependencies | Pure Python + ctypes | Requires display server |

## Key File

`hands/executor/vision.py`
