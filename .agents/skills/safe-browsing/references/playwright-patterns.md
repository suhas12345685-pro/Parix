# Playwright Usage Patterns

## Launch Options

```python
browser = await p.chromium.launch(
    headless=True,          # ALWAYS True — never show window
    args=["--no-sandbox"],  # Required in Docker/CI
)
```

## Common Selectors

| Pattern | Selector |
|---|---|
| By text | `page.get_by_text("Submit")` |
| By role | `page.get_by_role("button", name="OK")` |
| By CSS | `page.locator("input[name='email']")` |
| By test ID | `page.get_by_test_id("search-box")` |

## Wait Strategies

| Strategy | When to use |
|---|---|
| `wait_until="domcontentloaded"` | Static pages, fast |
| `wait_until="networkidle"` | SPAs that fetch data on load |
| `page.wait_for_selector(".result")` | Wait for specific element |
| `page.wait_for_timeout(1000)` | Last resort — avoid when possible |

## Context Isolation

Always create a fresh `BrowserContext` per task — no shared cookies, storage, or sessions leak between tasks.

## Error Handling

- `TimeoutError` — page didn't load in time, retry or report
- `page.on("pageerror")` — catch JS exceptions on the page
- Always `await browser.close()` in a finally block
