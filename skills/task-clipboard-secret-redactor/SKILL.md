---
name: task-clipboard-secret-redactor
description: Classifies a clipboard_sensitive_data sensor event and produces remediation guidance per secret family. Never reads the raw clipboard.
---

# Clipboard Secret Redactor

> Use when the clipboard sensor has flagged a payload that looks like
> a credential. This skill classifies *which kind* of secret and
> produces a remediation playbook, without ever reading the secret
> value.

## What it does

Reads the sensor's `matches[]` (category labels only — `api_key`,
`github_token`, `aws_access_key`, `password`, `token`) and emits:

- **families** — the normalized secret families that fired.
- **severity** — `low` / `medium` / `high`, driven by the worst
  family in the set. AWS keys and GitHub PATs are `high`; generic
  `password` matches are `medium`; unlabeled `token` is `low`.
- **guidance[]** — ordered remediation steps per family (rotate at
  the provider, scrub from shell history, scan git history with
  trufflehog, etc.).
- **clipboardClearRecommended** — `true` iff at least one family is
  `high` severity. The council can use this to decide whether to
  prompt the user to clear the clipboard immediately.

## How it differs from task-security-alert

Both skills trigger on `clipboard_sensitive_data`. They are not
redundant:

- `task-security-alert` is the *detector* — emits a binary alert and
  a notification. Reversibility=1, permissions=`clipboard:read +
  notification:send`.
- `task-clipboard-secret-redactor` is the *responder* — given the
  detection, classifies severity and produces actionable
  remediation. Reversibility=1, permissions=`[]` (no clipboard
  access — it never re-reads the clipboard).

The council can run both on the same event. They serve different
roles: detection-and-notification vs. classification-and-guidance.

## Privacy posture

This skill is intentionally cut off from the clipboard. It reads
*only* the category labels the upstream sensor emits — by design,
the clipboard sensor never puts the raw secret in its event data.
This skill can never leak a secret because the secret is never in
its input.

## Suggested follow-up

`task-clipboard-clear-secret` (not yet built) would be the action
skill that actually clears the clipboard when severity is high. That
skill needs `clipboard:write` permission and explicit user approval
per the won't-fix-by-design policy/approval contract.
