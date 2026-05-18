---
name: computer-use
description: See and interact with any GUI application using Set-of-Mark vision + UIA programmatic actions. No mouse/keyboard stealing.
---

# Computer Use — Set-of-Mark Vision Agent

> Use when the agent needs to see what's on screen and interact with GUI applications — clicking buttons, filling forms, reading UI state.

## How It Works

```
1. mss captures screenshot (read-only, invisible)
2. AccessibilityBridge reads the UI element tree (read-only)
3. marker.py overlays numbered red badges on interactive elements
4. Annotated screenshot + element list → vision-capable LLM
5. LLM picks: {"action": "click", "element_id": 7}
6. actions.py executes via UIA InvokePattern (programmatic, no mouse)
7. Repeat until done or max 15 steps
```

## Usage

```python
from hands.vision.agent import run_vision_agent

steps = await run_vision_agent(
    goal="Open Settings and enable dark mode",
    llm=your_vision_llm_provider,
    max_steps=15,
    step_delay=1.0,
)
```

## Available Actions

| Action | What it does | UIA Pattern |
|---|---|---|
| `click` / `invoke` | Activate button/link/menuitem | InvokePattern |
| `type` | Enter text into input field | ValuePattern.SetValue |
| `toggle` | Check/uncheck checkbox | TogglePattern |
| `select` | Pick a tab/list item | SelectionItemPattern |
| `scroll` | Scroll a container up/down | ScrollPattern |
| `read` | Read element's current value | WindowText |
| `done` | Signal task complete | — |
| `fail` | Signal task impossible | — |

## BANNED — Never Use

| Library | Why |
|---|---|
| `pyautogui` | Moves real mouse — breaks on user input |
| `pynput` | Global hooks — conflicts with user |
| `keyboard` | Steals keystrokes |
| `mouse` | Moves real cursor |

## Key Files

- `hands/vision/agent.py` — Main agent loop
- `hands/vision/marker.py` — Set-of-Mark annotation
- `hands/vision/actions.py` — UIA programmatic executor
- `hands/vision/types.py` — Data types
- `hands/accessibility/` — Platform backends for UI tree
