"""Headless browser automation via Playwright.

Usage: python playwright_agent.py <url> [--screenshot out.png]
Navigates to a URL in headless mode without stealing user focus.
"""

import argparse
import asyncio
import json
import sys


async def run(url: str, screenshot_path: str | None = None) -> dict:
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        return {"success": False, "error": "playwright not installed: pip install playwright"}

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.goto(url, wait_until="domcontentloaded", timeout=15000)

        title = await page.title()
        content_length = len(await page.content())

        if screenshot_path:
            await page.screenshot(path=screenshot_path)

        await browser.close()

    return {
        "success": True,
        "url": url,
        "title": title,
        "content_length": content_length,
        "screenshot": screenshot_path,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("url")
    parser.add_argument("--screenshot", default=None)
    args = parser.parse_args()
    result = asyncio.run(run(args.url, args.screenshot))
    print(json.dumps(result, indent=2))
