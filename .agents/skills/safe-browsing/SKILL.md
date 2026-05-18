---
name: safe-browsing
description: Headless browser automation via Playwright — web scraping, form filling, page interaction without a visible browser window.
---

# Safe Browsing — Headless Playwright

> Use when the agent needs to interact with web pages — scraping content, filling forms, clicking links, reading dynamic SPAs — without opening a visible browser.

## Why Headless

- No desktop window — doesn't interfere with user's screen
- No focus stealing — runs in background
- Sandboxed — isolated browser context per task
- Works in Docker / headless servers

## Usage Pattern

```python
from playwright.async_api import async_playwright

async def browse(url: str, goal: str) -> dict:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()
        await page.goto(url, wait_until="domcontentloaded")

        # Read page content
        title = await page.title()
        text = await page.inner_text("body")

        # Interact
        await page.fill("input[name='search']", "query")
        await page.click("button[type='submit']")

        await browser.close()
        return {"title": title, "text": text[:2000]}
```

## Safety Rules

| Rule | Reason |
|---|---|
| Always `headless=True` | Never pop up a browser window |
| Timeout all navigations | Prevent hangs on slow pages |
| Dispose context after use | No leaked sessions or cookies |
| No file downloads by default | Require explicit approval |
| No credential entry | User must handle auth themselves |

## BANNED — Never Use

| Library | Why |
|---|---|
| `selenium` | Heavy, outdated, requires driver management |
| `pyautogui` | Focus-stealing — banned project-wide |
| `mechanize` | No JS support, Python 2 era |

## Dependencies

- `playwright` — `pip install playwright && playwright install chromium`

## Key Files

- `hands/executor/cli.py` — Can invoke playwright scripts as subprocesses
- `hands/vision/agent.py` — For visible-browser tasks, use computer-use skill instead
