#!/usr/bin/env python3
"""Classify a terminal_error sensor event and suggest a fix.

Reads a JSON line from stdin with shape:
    {"output": "<tail of terminal output>", "matches": ["err:", ...]}

Writes a JSON object to stdout with:
    category, cause, suggestedFix, confidence, safeToAutoFix
"""

from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass


@dataclass
class Suggestion:
    category: str
    cause: str
    suggested_fix: str
    confidence: float
    safe_to_auto_fix: bool = False

    def to_dict(self) -> dict:
        return {
            "category": self.category,
            "cause": self.cause,
            "suggestedFix": self.suggested_fix,
            "confidence": round(self.confidence, 2),
            "safeToAutoFix": self.safe_to_auto_fix,
        }


# Order matters — more specific patterns first.
RULES: list[tuple[str, re.Pattern[str], str, str, float]] = [
    (
        "port-in-use",
        re.compile(r"(EADDRINUSE|address already in use|port \d+ is already)", re.I),
        "A process is already listening on the target port.",
        "Find the offender and stop it: `lsof -i :<port>` (mac/linux) or `netstat -ano | findstr :<port>` (windows), then kill the PID.",
        0.9,
    ),
    (
        "disk",
        re.compile(r"(ENOSPC|No space left on device|disk full)", re.I),
        "Filesystem is out of free space.",
        "Run `task-disk-cleanup` to find safe-to-delete caches, then retry.",
        0.95,
    ),
    (
        "permission",
        re.compile(r"(EACCES|permission denied|Operation not permitted)", re.I),
        "The process doesn't have permission to touch a file or socket.",
        "Check ownership of the path with `ls -la` (mac/linux); on Windows, run the terminal as Administrator. Avoid `sudo` blindly — first confirm which file is blocked.",
        0.85,
    ),
    (
        "npm-missing-module",
        re.compile(r"(Cannot find module|MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND)", re.I),
        "Node can't find an imported module.",
        "Run `npm install` to ensure dependencies are present. If you just added a package, `npm install <name>` explicitly.",
        0.88,
    ),
    (
        "npm-version",
        re.compile(r"(npm ERR! peer dep|ERESOLVE|version mismatch|requires Node version)", re.I),
        "An npm dependency has an incompatible peer or Node version.",
        "Inspect with `npm ls <package>`; consider `npm install --legacy-peer-deps` only if you've confirmed the peer mismatch is harmless.",
        0.7,
    ),
    (
        "python-module",
        re.compile(r"(ModuleNotFoundError|ImportError): No module named", re.I),
        "Python can't import a module — it isn't installed in the active environment.",
        "Confirm the active interpreter (`python -c \"import sys; print(sys.executable)\"`), then `pip install <module>` against it.",
        0.9,
    ),
    (
        "python-indent",
        re.compile(r"IndentationError|TabError", re.I),
        "Python source has mixed/bad indentation.",
        "Open the file at the reported line and replace tabs with spaces (or run `python -m tabnanny <file>` to locate the offender).",
        0.95,
    ),
    (
        "python-traceback",
        re.compile(r"Traceback \(most recent call last\)", re.I),
        "An uncaught Python exception — see the final line for the exception type.",
        "Read the *last* line of the traceback for the actual exception; the lines above are call sites, not the cause.",
        0.6,
    ),
    (
        "git-non-fast-forward",
        re.compile(r"(non-fast-forward|Updates were rejected|fetch first)", re.I),
        "The remote has commits you don't. Push was rejected.",
        "Run `git pull --rebase` to integrate remote changes, resolve conflicts if any, then `git push`.",
        0.9,
    ),
    (
        "git-overwrite",
        re.compile(r"(Your local changes .* would be overwritten|Untracked working tree files .* would be overwritten)", re.I),
        "Git refuses to clobber uncommitted or untracked files.",
        "Stash with `git stash -u` or commit first, then retry the checkout/pull. Avoid `git checkout -- .` unless you've reviewed the diff.",
        0.9,
    ),
    (
        "git-conflict",
        re.compile(r"(CONFLICT \(|Merge conflict in|fix conflicts and then commit)", re.I),
        "There's an unresolved merge conflict.",
        "Run `git status` to see conflicted files. Open each, resolve the `<<<<<<<` markers, then `git add` and `git commit`.",
        0.95,
    ),
    (
        "docker-daemon",
        re.compile(r"(Cannot connect to the Docker daemon|docker: Cannot connect|/var/run/docker\.sock)", re.I),
        "The Docker daemon isn't running or isn't reachable.",
        "Start Docker Desktop (mac/win) or `sudo systemctl start docker` (linux). Verify with `docker info`.",
        0.95,
    ),
    (
        "docker-image",
        re.compile(r"(pull access denied|repository does not exist|manifest unknown|Image .* not found)", re.I),
        "Docker can't find or access the image.",
        "Check the spelling of the image tag; `docker login` if it's a private registry; `docker pull <image>` to confirm reachability.",
        0.85,
    ),
    (
        "network-connection-refused",
        re.compile(r"(ECONNREFUSED|Connection refused|connect: connection refused)", re.I),
        "Nothing is listening on the target host:port.",
        "Confirm the service is actually running (`ps`, `lsof -i :<port>`); check you're not hitting localhost when the service is in a container.",
        0.85,
    ),
    (
        "network-dns",
        re.compile(r"(getaddrinfo (ENOTFOUND|EAI_AGAIN)|DNS lookup failed|Name or service not known)", re.I),
        "DNS resolution failed for a host.",
        "Check spelling of the host. If correct: `nslookup <host>` to confirm; verify network connectivity.",
        0.85,
    ),
]


GENERIC_FALLBACK = Suggestion(
    category="generic",
    cause="Unrecognized error pattern.",
    suggested_fix="Re-run with verbose output (e.g. `-v` / `--debug` / `set -x`); paste the full error into a search engine.",
    confidence=0.3,
)


def classify(output: str) -> Suggestion:
    if not output:
        return GENERIC_FALLBACK

    # Look at the last 2 KB by default — most errors print their root
    # cause near the end. But scan the full passed-in buffer.
    haystack = output

    for category, pattern, cause, fix, confidence in RULES:
        if pattern.search(haystack):
            return Suggestion(
                category=category,
                cause=cause,
                suggested_fix=fix,
                confidence=confidence,
            )
    return GENERIC_FALLBACK


def main() -> int:
    raw = sys.stdin.read().strip()
    inputs: dict = {}
    if raw:
        try:
            inputs = json.loads(raw)
        except json.JSONDecodeError:
            # treat the raw stdin as the output buffer
            inputs = {"output": raw}

    output = str(inputs.get("output") or "")
    suggestion = classify(output)
    print(json.dumps(suggestion.to_dict()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
