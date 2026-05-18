---
name: task-security-alert
description: Skill — Security Alerts
---

# Skill — Security Alerts

> Triggered on `clipboard_sensitive_data`, suspicious process activity, or credential-related events.

## Detection Patterns

| Pattern | Trigger | Response |
|---|---|---|
| Clipboard contains API key / password / token | `clipboard_sensitive_data` | Urgent notification |
| `.env` file changed | file watcher (future) | Notification |
| SSH key accessed by unusual process | process monitor (future) | Notification |
| Known malware process name | process watcher (future) | Urgent notification |
| Outbound connection to known-bad IP | network monitor (future) | Urgent notification |

## Clipboard Security

When sensitive data is detected on clipboard:
1. **Immediately notify** the user with what type of data was found (password, API key, SSH key, etc.)
2. **Never log the actual content** — only log the type/category
3. **Suggest clearing** the clipboard after 60 seconds if still there
4. Categories detected: passwords, API keys, AWS credentials, SSH private keys, JWTs, credit card numbers

## Principles

1. **Never read, store, or transmit** the actual sensitive content — only detect its presence
2. **Never auto-clear** the clipboard (user may need it)
3. **Never access** password managers, keychains, or credential stores
4. **Alert urgency is always HIGH** for security events
5. Log only the event type and timestamp in the audit ledger

## Future Expansion

- npm audit / pip audit integration for vulnerability scanning
- Git secrets scanning before commits
- Suspicious network connection monitoring
- Browser extension integration for phishing detection
