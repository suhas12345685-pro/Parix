---
name: task-virtual-desktop
description: Spins up and manages isolated Windows Virtual Desktops for safe UI automation.
---

# Virtual Desktop Management

> When headless mode isn't possible, this skill moves the agent's work to a hidden virtual desktop.

## Why This Exists

`pyautogui` and similar libraries are **permanently banned** because they steal mouse/keyboard focus and break the moment the user interacts with their computer. When Parix absolutely must interact with a GUI (no CLI or API alternative), it does so on a **hidden virtual desktop** that the user never sees.

## Instructions
1. Use `pyvda` (Python Virtual Desktop Access) to spawn a new desktop named "Parix_Workspace".
2. Launch the target application specifically on "Parix_Workspace".
3. Perform all UI automation (clicks, typing) on that isolated desktop only.
4. The user's primary desktop is untouched — their mouse, keyboard, and windows are unaffected.
5. Close the virtual desktop when the task completes.
6. **Never** use pyautogui, pynput, keyboard, or mouse libraries — even on the virtual desktop. Use pywinauto's UIA backend for GUI interaction within the isolated desktop.

## Fallback
- If `pyvda` is not installed or the OS doesn't support virtual desktops, **refuse the GUI task** and suggest a CLI alternative instead. Never fall back to controlling the user's active desktop.

## Automation Scripts
- `scripts/vda_manager.py` exposes commands: create, list, close.
