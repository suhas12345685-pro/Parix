# Headless Automation Tools Reference

## Web Automation

| Tool | Install | Headless | Notes |
|---|---|---|---|
| Playwright | `pip install playwright` | Yes | Best cross-browser support |
| Selenium | `pip install selenium` | Yes | Requires browser driver |
| Puppeteer | `npm i puppeteer` | Yes | Chromium only |

## CLI Alternatives to GUI Apps

| GUI Action | CLI Equivalent |
|---|---|
| File manager browse | `ls`, `find`, `tree` |
| Text editor | `sed`, `awk`, or write to file |
| Browser form fill | Playwright/Selenium headless |
| Settings change | Registry edit (Win), `defaults` (Mac), config files (Linux) |

## Rules
- Never steal foreground focus from the user
- Always use `headless=True` for browsers
- Log all background actions to SQLite for audit
- If GUI is unavoidable, delegate to task-virtual-desktop
