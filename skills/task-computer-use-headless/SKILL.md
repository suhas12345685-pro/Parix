---
name: task-computer-use-headless
description: Performs UI and web tasks in the background without stealing user focus.
---

# Headless Computer Use

> Allows the agent to do its own work even while the user is actively using the mouse and keyboard on the main screen.

## Banned Libraries (hard rule — no exceptions)

| Library | Why banned |
|---|---|
| `pyautogui` | Moves the real mouse/keyboard — breaks instantly if user touches anything |
| `pynput` | Global input hooks — conflicts with user input, unreliable |
| `keyboard` | Same — global hooks steal keystrokes |
| `mouse` | Same — moves the real cursor |

## Allowed Approaches (priority order)

1. **CLI / REST API** — always prefer this. Most apps have CLI equivalents.
2. **Playwright headless** (`headless=True`) — for web tasks. Invisible to user.
3. **Selenium headless** (`--headless`) — fallback if Playwright unavailable.
4. **Virtual desktop** (task-virtual-desktop) — last resort for GUI-only apps. Isolates to a hidden desktop so user's screen is untouched.

## Instructions
1. **Never** steal foreground focus. If your approach would move the user's mouse or type into their active window, STOP and use a different approach.
2. Use **Playwright** or **Selenium** in `headless=True` mode for all web-based tasks.
3. For local apps, prefer CLI equivalents or REST APIs.
4. If GUI interaction is strictly necessary, route to task-virtual-desktop to isolate the window on a hidden desktop.
5. Log all background actions to SQLite so the user can audit them later.

## Automation Scripts
- `scripts/playwright_agent.py` — headless browser navigation, completely invisible to user.
