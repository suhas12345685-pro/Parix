---
name: cli-executor
description: Execute shell commands safely via subprocess with timeout. Never uses shell=True.
---

# CLI Executor

> Use when the agent needs to run a terminal command — build, test, install, diagnose.

## Usage

```python
from hands.executor.cli import run_sync, run_async, execute

# Synchronous
result = run_sync(["npm", "test"], timeout=60)

# Async
result = await run_async(["pytest", "-v"], timeout=120)

# From payload dict (used by Synapse TASK_REQUEST)
result = await execute({"argv": ["git", "status"], "timeout": 30})
```

## Return Format

```python
{
    "success": True,       # exit_code == 0
    "exit_code": 0,
    "stdout": "...",
    "stderr": "...",
    "error": None,         # set on failure
}
```

## Safety Rules

1. **NEVER** `shell=True` — all commands run as argv lists
2. Default timeout: 30 seconds
3. String commands are parsed via `shlex.split()`
4. Empty commands return immediate failure
5. FileNotFoundError and TimeoutExpired are caught and returned as errors

## Key File

`hands/executor/cli.py`
