#!/usr/bin/env python3
"""Run `az` with auth-context + operation classification.

Input stdin JSON:
    {"args": ["vm", "list"], "dryRun": true, "timeoutSeconds": 60}

Output stdout JSON: see SKILL.md / config.json outputs schema.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from typing import Any

DESTROY_VERBS = {"delete", "destroy", "remove", "purge", "wipe"}
MUTATE_VERBS = {
    "create",
    "add",
    "update",
    "set",
    "patch",
    "import",
    "deploy",
    "restart",
    "reset",
    "rotate",
    "enable",
    "disable",
    "assign",
    "unassign",
    "renew",
    "approve",
    "reject",
    "promote",
    "stop",
    "start",
    "lock",
    "unlock",
    "regenerate",
}
READ_VERBS = {
    "list",
    "show",
    "describe",
    "get",
    "diagnose",
    "info",
    "version",
    "query",
    "preview",
    "check",
    "validate",
}


def classify(args: list[str]) -> str:
    if not args:
        return "read"
    tail = [a.lower() for a in args if isinstance(a, str)]

    for token in reversed(tail):
        if token.startswith("-"):
            continue
        if token in DESTROY_VERBS or token.startswith("delete-"):
            return "destroy"
        if token in MUTATE_VERBS:
            return "mutate"
        if token in READ_VERBS or token.startswith("get-") or token.startswith("list-"):
            return "read"

    return "read"


def run_quietly(argv: list[str], timeout: float) -> tuple[int, str, str]:
    try:
        proc = subprocess.run(
            argv,
            capture_output=True,
            timeout=timeout,
            shell=False,
            text=True,
            errors="replace",
        )
    except FileNotFoundError:
        return (127, "", "command_not_found")
    except subprocess.TimeoutExpired:
        return (124, "", "timeout")
    return (proc.returncode, proc.stdout or "", proc.stderr or "")


def detect_environment(timeout: float) -> dict[str, Any]:
    if shutil.which("az") is None:
        return {
            "installed": False,
            "authenticated": False,
            "subscription": "",
            "tenant": "",
        }
    rc, _, _ = run_quietly(["az", "--version"], timeout)
    if rc != 0:
        return {
            "installed": False,
            "authenticated": False,
            "subscription": "",
            "tenant": "",
        }

    rc2, stdout2, _ = run_quietly(["az", "account", "show", "--output", "json"], timeout)
    if rc2 != 0 or not stdout2.strip():
        return {
            "installed": True,
            "authenticated": False,
            "subscription": "",
            "tenant": "",
        }

    try:
        account = json.loads(stdout2)
    except json.JSONDecodeError:
        return {
            "installed": True,
            "authenticated": False,
            "subscription": "",
            "tenant": "",
        }

    return {
        "installed": True,
        "authenticated": True,
        "subscription": str(account.get("name") or ""),
        "tenant": str(account.get("tenantId") or ""),
    }


def main() -> int:
    raw = sys.stdin.read().strip()
    try:
        inputs = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        inputs = {}
    if not isinstance(inputs, dict):
        inputs = {}

    args_in = inputs.get("args")
    args: list[str] = []
    if isinstance(args_in, list):
        args = [str(a) for a in args_in if isinstance(a, (str, int, float))]
    dry_run = bool(inputs.get("dryRun", True))
    timeout = inputs.get("timeoutSeconds")
    if not isinstance(timeout, (int, float)) or timeout <= 0:
        timeout = 60.0
    timeout = float(timeout)

    if not args:
        print(
            json.dumps(
                {
                    "installed": False,
                    "authenticated": False,
                    "subscription": "",
                    "tenant": "",
                    "operationClass": "read",
                    "executed": False,
                    "stdout": "",
                    "stderr": "",
                    "exitCode": None,
                    "refusalReason": "missing_args",
                }
            )
        )
        return 1

    env = detect_environment(timeout)
    op_class = classify(args)
    result: dict[str, Any] = {
        **env,
        "operationClass": op_class,
        "executed": False,
        "stdout": "",
        "stderr": "",
        "exitCode": None,
        "refusalReason": "",
    }

    if not env["installed"]:
        result["refusalReason"] = "not_installed"
        print(json.dumps(result))
        return 0

    if not env["authenticated"]:
        result["refusalReason"] = "not_authenticated"
        print(json.dumps(result))
        return 0

    if dry_run:
        result["refusalReason"] = "dry_run"
        result["stdout"] = "DRY: az " + " ".join(args)
        print(json.dumps(result))
        return 0

    if op_class == "destroy":
        result["refusalReason"] = "destructive_requires_approval"
        print(json.dumps(result))
        return 0

    rc, stdout, stderr = run_quietly(["az"] + args, timeout)
    result["executed"] = True
    result["exitCode"] = rc
    result["stdout"] = stdout[-8000:]
    result["stderr"] = stderr[-2000:]

    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
