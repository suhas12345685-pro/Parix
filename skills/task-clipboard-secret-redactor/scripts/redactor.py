#!/usr/bin/env python3
"""Classify clipboard_sensitive_data sensor events into severity + guidance.

Input stdin JSON: {"matches": ["api_key", ...], "length": 64}
Output stdout JSON: {"families": [...], "severity": "high", "guidance": [...], "clipboardClearRecommended": true}
"""

from __future__ import annotations

import json
import sys


# Normalize sensor labels to canonical families. The sensor today
# emits the keys from SENSITIVE_PATTERNS in clipboard_watch.py; this
# table lets us survive label drift without breaking the contract.
FAMILY_ALIASES = {
    "api_key": "api_key",
    "openai_key": "api_key",
    "google_api_key": "api_key",
    "github_token": "github_token",
    "ghp": "github_token",
    "aws_access_key": "aws_access_key",
    "aws_secret_key": "aws_access_key",
    "akia": "aws_access_key",
    "password": "password",
    "passwd": "password",
    "pwd": "password",
    "token": "token",
    "secret": "token",
    "bearer": "token",
    "jwt": "jwt",
}

# Severity ranking: high beats medium beats low.
FAMILY_SEVERITY = {
    "aws_access_key": "high",
    "github_token": "high",
    "api_key": "high",
    "jwt": "medium",
    "password": "medium",
    "token": "low",
}

SEVERITY_ORDER = {"low": 0, "medium": 1, "high": 2}

# Per-family remediation. Order matters — listed steps are run in the
# order presented. Each step is a self-contained user-facing sentence.
GUIDANCE_BY_FAMILY: dict[str, list[str]] = {
    "aws_access_key": [
        "Rotate the access key in the AWS IAM console immediately; mark the leaked key inactive before deleting.",
        "Search your shell history for the key prefix (`grep -r AKIA ~/.bash_history ~/.zsh_history` etc.) and scrub matches.",
        "Run a `trufflehog filesystem .` or `git log -p | grep AKIA` over any repo you may have committed it to.",
        "Once rotated, update `~/.aws/credentials` or your secret store with the new value.",
    ],
    "github_token": [
        "Revoke the PAT at https://github.com/settings/tokens — don't just regenerate, revoke the leaked one.",
        "Audit recent activity: https://github.com/settings/security-log for actions taken by the leaked token.",
        "Search local repos for the `ghp_` prefix (`git log -p | grep ghp_`) and scrub any commits that include it.",
        "Issue a new PAT with the *minimum* scopes the workflow actually needs.",
    ],
    "api_key": [
        "Rotate the key at the provider's dashboard (OpenAI / Google / etc.).",
        "Search your shell history and project files for the key prefix; scrub matches.",
        "Move the new key into a `.env` file that is git-ignored — don't paste it back into the clipboard.",
    ],
    "jwt": [
        "Treat the JWT as exposed for the rest of its lifetime; if it's user-bearer, force a session re-issue server-side.",
        "Check the `exp` claim — if the token is short-lived, the window may be tight enough to ignore.",
        "If the JWT signs API calls, rotate the signing secret server-side and reissue all tokens.",
    ],
    "password": [
        "Change the password at the service it belongs to before doing anything else.",
        "If the same password is used elsewhere, change it there too (a password manager makes this less painful).",
        "Consider enabling 2FA on the affected account.",
    ],
    "token": [
        "The sensor flagged a generic token-shaped payload — confirm what service it belongs to.",
        "If it's an access token, rotate at the provider; if it's a session token, log out and back in to invalidate.",
    ],
}


def normalize_families(raw_matches: list) -> list[str]:
    seen = []
    seen_set = set()
    for item in raw_matches or []:
        key = str(item).lower().strip()
        family = FAMILY_ALIASES.get(key, key)
        if family in FAMILY_SEVERITY and family not in seen_set:
            seen.append(family)
            seen_set.add(family)
    return seen


def aggregate_severity(families: list[str]) -> str:
    worst = "low"
    for fam in families:
        sev = FAMILY_SEVERITY.get(fam, "low")
        if SEVERITY_ORDER[sev] > SEVERITY_ORDER[worst]:
            worst = sev
    return worst


def assemble_guidance(families: list[str]) -> list[str]:
    """Concatenate per-family guidance in severity order, dedup."""
    by_sev = sorted(
        families,
        key=lambda f: -SEVERITY_ORDER[FAMILY_SEVERITY.get(f, "low")],
    )
    out: list[str] = []
    seen = set()
    for fam in by_sev:
        for line in GUIDANCE_BY_FAMILY.get(fam, []):
            if line not in seen:
                out.append(line)
                seen.add(line)
    if not out:
        out.append(
            "No recognized secret family — confirm the clipboard contents and rotate whatever credential it represents.",
        )
    return out


def main() -> int:
    raw = sys.stdin.read().strip()
    try:
        inputs = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        inputs = {}

    matches = inputs.get("matches") if isinstance(inputs, dict) else None
    if not isinstance(matches, list):
        matches = []

    families = normalize_families(matches)
    severity = aggregate_severity(families) if families else "low"
    guidance = assemble_guidance(families)

    result = {
        "families": families,
        "severity": severity,
        "guidance": guidance,
        "clipboardClearRecommended": severity == "high",
    }
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
