#!/usr/bin/env python3
"""Run gcloud with auth-context + operation classification.

Input stdin JSON:
    {"args": ["compute", "instances", "list"], "dryRun": true, "timeoutSeconds": 60}

Output stdout JSON: see SKILL.md / config.json outputs schema.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from typing import Any

DESTROY_VERBS = {"delete", "destroy", "remove", "purge"}
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
    "drain",
    "evacuate",
    "rollback",
    "promote",
    "stop",
    "start",
}
READ_VERBS = {
    "list",
    "describe",
    "get",
    "show",
    "diagnose",
    "info",
    "version",
    "config",
    "auth",
}


def classify(args: list[str]) -> str:
    if not args:
        return "read"
    tail = [a.lower() for a in args if isinstance(a, str)]

    # Last positional that looks like a verb wins. gcloud nests like
    # `gcloud compute instances delete`, so the verb is usually the
    # last token before flags.
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
    if shutil.which("gcloud") is None:
        return {"installed": False, "authenticated": False, "project": ""}
    rc, _, _ = run_quietly(["gcloud", "--version"], timeout)
    if rc != 0:
        return {"installed": False, "authenticated": False, "project": ""}

    # gcloud auth list --filter=status:ACTIVE --format="value(account)"
    rc2, stdout2, _ = run_quietly(
        [
            "gcloud",
            "auth",
            "list",
            "--filter=status:ACTIVE",
            "--format=value(account)",
        ],
        timeout,
    )
    authenticated = rc2 == 0 and bool(stdout2.strip())

    rc3, stdout3, _ = run_quietly(
        ["gcloud", "config", "get-value", "project"], timeout
    )
    project = stdout3.strip() if rc3 == 0 else ""
    if project.lower() in ("(unset)", "unset"):
        project = ""

    return {
        "installed": True,
        "authenticated": authenticated,
        "project": project,
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
                    "project": "",
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
        result["stdout"] = "DRY: gcloud " + " ".join(args)
        print(json.dumps(result))
        return 0

    if op_class == "destroy":
        # Even with dryRun=false, refuse destroy at the skill layer.
        # The caller has to surface this to the user and explicitly
        # invoke a follow-up skill that asserts human approval.
        result["refusalReason"] = "destructive_requires_approval"
        print(json.dumps(result))
        return 0

    rc, stdout, stderr = run_quietly(["gcloud"] + args, timeout)
    result["executed"] = True
    result["exitCode"] = rc
    result["stdout"] = stdout[-8000:]
    result["stderr"] = stderr[-2000:]
    if rc != 0:
        result["refusalReason"] = ""  # not a refusal, an exec error

    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
