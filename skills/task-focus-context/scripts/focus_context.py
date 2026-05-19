#!/usr/bin/env python3
"""Classify a focus_change event into a context kind + helpfulness hint.

Input stdin JSON:
    {"focused_app": "Code", "previous_app": "Terminal",
     "focused_element": {"role": "text_field", "name": "main.py", "state": ["focused"]}}

Output stdout JSON:
    {"contextKind": "editor", "appFamily": "vscode",
     "helpfulnessHint": "Likely coding; offer to run tests or lint on save.",
     "shouldDeferAction": true}
"""

from __future__ import annotations

import json
import sys

# Each entry: (app_family, contextKind, [substrings_that_match], shouldDeferAction, hint)
APP_TABLE: list[tuple[str, str, list[str], bool, str]] = [
    (
        "vscode",
        "editor",
        ["visual studio code", "vscode", "code.exe", "code - insiders"],
        True,
        "Coding in VS Code — pre-warm task-build-watch and offer test runs on save.",
    ),
    (
        "jetbrains",
        "editor",
        [
            "intellij",
            "pycharm",
            "webstorm",
            "goland",
            "clion",
            "rider",
            "datagrip",
            "rubymine",
            "phpstorm",
            "appcode",
        ],
        True,
        "Coding in a JetBrains IDE — defer notifications until idle.",
    ),
    (
        "sublime",
        "editor",
        ["sublime text", "sublime_text"],
        True,
        "Editing in Sublime — defer non-urgent interruptions.",
    ),
    (
        "neovim",
        "editor",
        ["nvim", "neovim", "vim "],
        True,
        "Editing in vim/neovim inside a terminal — defer interruptions; offer to read shell history on demand.",
    ),
    (
        "terminal",
        "terminal",
        ["terminal", "iterm", "windows terminal", "cmd.exe", "powershell", "wezterm", "alacritty", "kitty"],
        False,
        "Likely running commands — terminal_error sensor should pick up failures and route to task-terminal-error-resolver.",
    ),
    (
        "chrome",
        "browser",
        ["chrome", "chromium", "google chrome"],
        False,
        "Browsing the web — safe-browsing skill can scrape headlessly if the user asks for a follow-up.",
    ),
    (
        "firefox",
        "browser",
        ["firefox"],
        False,
        "Browsing the web — safe to surface non-urgent notifications.",
    ),
    (
        "edge",
        "browser",
        ["edge", "microsoft edge", "msedge"],
        False,
        "Browsing the web — safe to surface non-urgent notifications.",
    ),
    (
        "safari",
        "browser",
        ["safari"],
        False,
        "Browsing the web on Safari — safe to surface non-urgent notifications.",
    ),
    (
        "slack",
        "chat",
        ["slack"],
        True,
        "User is in Slack — check for huddle/call state before interrupting; otherwise unread digest is useful.",
    ),
    (
        "discord",
        "chat",
        ["discord"],
        True,
        "User is in Discord — likely a voice channel if focused mid-day.",
    ),
    (
        "teams",
        "chat",
        ["microsoft teams", "teams.exe", "ms-teams"],
        True,
        "Microsoft Teams — almost certainly on a call or in a meeting; hold non-urgent actions.",
    ),
    (
        "zoom",
        "chat",
        ["zoom", "zoom meetings", "zoom.us"],
        True,
        "Zoom is focused — assume the user is on a call; hold all non-urgent notifications.",
    ),
    (
        "gmail",
        "email",
        ["gmail", "mail.google.com"],
        False,
        "Reading email — useful moment to summarize sender history or pre-fetch attachments.",
    ),
    (
        "outlook",
        "email",
        ["outlook", "ms-outlook"],
        False,
        "In Outlook — calendar context is useful if a meeting is upcoming.",
    ),
    (
        "notion",
        "docs",
        ["notion"],
        True,
        "Writing in Notion — defer interruptions; offer to fetch sources if the user pastes a URL.",
    ),
    (
        "docs",
        "docs",
        ["google docs", "docs.google.com", "word", "winword"],
        True,
        "Writing in a doc editor — defer interruptions.",
    ),
    (
        "obs",
        "media",
        ["obs studio", "obs.exe"],
        True,
        "OBS Studio is focused — likely recording or streaming; treat all interruptions as high-cost.",
    ),
]


GENERIC_HINT = "Unknown context — keep notifications conservative until classified."


def classify(focused_app: str) -> tuple[str, str, bool, str]:
    needle = (focused_app or "").lower().strip()
    if not needle:
        return ("unknown", "unknown", True, GENERIC_HINT)

    for family, kind, substrings, defer, hint in APP_TABLE:
        if any(s in needle for s in substrings):
            return (family, kind, defer, hint)
    return ("unknown", "unknown", True, f"Unfamiliar app '{focused_app}' — {GENERIC_HINT}")


def main() -> int:
    raw = sys.stdin.read().strip()
    try:
        inputs = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        inputs = {}

    focused_app = inputs.get("focused_app") if isinstance(inputs, dict) else ""
    if not isinstance(focused_app, str):
        focused_app = ""

    family, kind, defer, hint = classify(focused_app)

    result = {
        "contextKind": kind,
        "appFamily": family,
        "helpfulnessHint": hint,
        "shouldDeferAction": defer,
    }
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
