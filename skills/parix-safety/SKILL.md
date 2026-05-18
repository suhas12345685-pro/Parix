---
name: parix-safety
description: Parix Skill — Constitution & Safety Guardrails
---

# Parix Skill — Constitution & Safety Guardrails

> Use when adding or reviewing autonomous action rules, command blocking, reversibility checks, or safety-sensitive executor behavior.

## Core Principle

Parix may observe broadly, but it should act narrowly. Autonomous actions must be reversible, local, auditable, and scoped to the user's workstation unless the user explicitly approves more.

## Banned Libraries

These libraries are permanently banned from the entire Parix codebase:

| Library | Reason |
|---|---|
| `pyautogui` | Steals mouse/keyboard focus — breaks instantly if user interacts |
| `pynput` | Same problem — global input hooks conflict with user input |
| `keyboard` | Global hotkey hooks — unreliable, platform-dependent, steals input |
| `mouse` | Direct mouse control — same focus-stealing problem |

**Allowed alternatives:**
- **Screenshots:** `mss` (read-only screen capture, no focus change)
- **Window info:** `ctypes` / Win32 API (read-only, no focus change)
- **Accessibility tree:** `pywinauto` read-only queries (never `.click()` or `.type_keys()` on user's desktop)
- **Web automation:** Playwright/Selenium in `headless=True` only
- **GUI automation (if unavoidable):** Virtual desktop isolation via `pyvda` — never on the user's active desktop

## Block by Default

Block these without explicit user confirmation:

- destructive filesystem operations on broad paths
- privilege escalation (`sudo`, `runas`, admin shell elevation)
- OS shutdown/reboot/poweroff
- registry/system directory deletion
- raw disk writes and filesystem formatting
- credential reads or environment dumps containing secrets
- forceful process termination
- package publish/unpublish
- force push, `git reset --hard`, and destructive `git clean`
- Terraform/Kubernetes/cloud deletion or apply operations

## Allow by Default

Allow low-risk inspection and local diagnostics:

- `npm test`, `npm run build`, `pytest`, `tsc`
- `git status`, `git diff`, `git log`
- process listing and service status checks
- disk, CPU, memory, battery, and uptime reads
- local notifications

## Adding Rules

1. Prefer narrow regexes with a clear reason string.
2. Put generic destructive patterns in `BLOCKED_COMMANDS`.
3. Put Parix/domain-specific patterns in `DOMAIN_BLOCKED_COMMANDS`.
4. Add Vitest coverage in `atrium/src/intelligence/__tests__/constitution.test.ts`.
5. Include one positive test proving a nearby safe command is still allowed.

## Review Questions

- Could this action delete, publish, exfiltrate, or make remote infrastructure changes?
- Could a false positive frustrate normal local development?
- Is the action reversible without privileged access?
- Will the audit ledger explain why the action was allowed or blocked?
