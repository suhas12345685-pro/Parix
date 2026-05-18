# Terminal Error Patterns Reference

## Detection Patterns (watcher.py)

| Pattern | Weight | Tag | Example |
|---|---|---|---|
| `\btraceback\b` | 0.30 | traceback | Python stack trace |
| `\bsegfault\b` | 0.35 | segfault | C/C++ segmentation fault |
| `\bFAILED\b` | 0.20 | FAILED | Test/build failure |
| `\berror:` | 0.15 | error: | Generic error message |
| `\bERR!` | 0.20 | ERR! | npm error |
| `\bexception\b` | 0.15 | exception | Uncaught exception |
| `\bpanic\b` | 0.30 | panic | Go/Rust panic |
| `\bfatal\b` | 0.25 | fatal | Fatal error |
| `\bOOM\b` / `out of memory` | 0.30 | oom | Memory exhaustion |
| `ENOSPC` / `No space left` | 0.25 | disk_full | Disk full |
| `ECONNREFUSED` | 0.15 | conn_refused | Service not running |
| `EACCES` / `permission denied` | 0.15 | perm_denied | Access denied |

## Confidence Scoring

`confidence = min(1.0, 0.4 + sum(matched_weights))`

## False Positive Suppressors

| Pattern | Why suppressed |
|---|---|
| `0 error` | "Build succeeded with 0 errors" |
| `no errors?` | "No errors found" |
| `error.*(handler\|middleware\|boundary)` | Class names, not errors |
| `error_log\|error_level\|error_code` | Configuration variables |
| `import.*error\|from.*error` | Module imports |
