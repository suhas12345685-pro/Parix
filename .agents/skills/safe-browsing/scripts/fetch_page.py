"""Fetch a URL headlessly and return title + text content."""

import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


async def fetch(url: str, timeout_ms: int = 15000) -> dict:
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()
        await page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
        title = await page.title()
        text = await page.inner_text("body")
        await browser.close()
        return {"url": url, "title": title, "text": text[:5000]}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python fetch_page.py <url>")
        sys.exit(1)
    result = asyncio.run(fetch(sys.argv[1]))
    print(json.dumps(result, indent=2, ensure_ascii=False))
