# Common Error Codes Reference

## HTTP Status Codes

| Code | Meaning | Action |
|---|---|---|
| 400 | Bad Request | Check request payload |
| 401 | Unauthorized | Check API key / token |
| 403 | Forbidden | Check permissions |
| 404 | Not Found | Check URL / endpoint |
| 429 | Rate Limited | Back off and retry |
| 500 | Internal Server Error | Server-side issue |
| 502 | Bad Gateway | Proxy / upstream issue |
| 503 | Service Unavailable | Service overloaded |

## Node.js Error Codes

| Code | Meaning |
|---|---|
| ECONNREFUSED | Connection refused — service not running |
| ENOENT | File or directory not found |
| ENOSPC | No space left on device |
| EACCES | Permission denied |
| ETIMEDOUT | Connection timed out |
| ENOMEM | Out of memory |

## Python Exit Codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | General error |
| 2 | Misuse of command |
| 137 | Killed (SIGKILL / OOM) |
| 139 | Segfault (SIGSEGV) |

## Log Severity Levels

| Level | Priority | Typical Action |
|---|---|---|
| DEBUG | 10 | Ignore |
| INFO | 20 | Ignore |
| WARNING | 30 | Monitor |
| ERROR | 40 | Investigate |
| CRITICAL | 50 | Alert immediately |
