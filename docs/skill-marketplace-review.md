# Skill marketplace — submission & review

Third-party skills extend Parix's capabilities. They run in the same
process as the agent and have access to the OS via Hands, so admission
is a real trust decision. This page describes how submission works, what
reviewers check, and what gets a skill banned.

## Submission format

A submission is a Git repo (your own, hosted on GitHub / GitLab / Codeberg)
with the following layout:

```
your-skill-repo/
├── SKILL.md                 # manifest (see schema below)
├── README.md                # human description, install requirements
├── LICENSE                  # OSI-approved license required
├── scripts/                 # runtime code (Python or Node)
│   └── entry.py | entry.ts
├── templates/               # optional: jinja/handlebars templates
├── references/              # optional: read-only docs the skill cites
└── tests/                   # required for v1+
    └── test_*.py | *.test.ts
```

### `SKILL.md` manifest

A YAML front-matter block followed by a markdown description. The
front-matter must match the `SkillManifest` schema in
`shared/types/skill.ts`. Minimum:

```yaml
---
id: my-cool-skill                  # globally unique, kebab-case
version: 1.0.0                      # skill semver
description: One-line pitch.        # <= 200 chars
runtime: py                         # py | node | sh
entry: scripts/entry.py
reversibility: 0.8                  # 0=destructive, 1=read-only
permissions:                        # SkillPermission union, declare all
  - filesystem:read
  - process:read
triggers:
  - eventType: terminal_error
    keywords: [npm, build, fail]
    minConfidence: 0.7
inputs:
  - name: error_text
    type: string
    required: true
outputs:
  - name: suggested_fix
    type: string
timeoutMs: 30000
---

# What this skill does

Plain-English description. What problem it solves. When it fires. How
the user benefits. What the user should expect to see.
```

`reversibility` matters: anything < 0.5 will hit the user-approval gate
even in `safe-auto-fix` mode.

### Submission process

1. **Open an issue** in the Parix repo
   (`https://github.com/suhas12345685-pro/Parix/issues`) using the feature
   request template and title it `[skill] <skill-name>`.
2. **Link your skill repo** at a specific tag (we don't accept
   `main`-tracking submissions — pin a version).
3. **Self-disclose risk**: fill in the issue template's
   "What can go wrong?" section. Lying here is a ban, not a rejection.
4. **Wait for triage** — first response within 5 working days.

## What reviewers check

In rough order, every reviewer runs through this list. Failure on any
of the *blocker* items rejects the submission; failure on a *warn* item
gets you a "please fix and resubmit."

### Blockers

| | What | Why |
|---|---|---|
| B1 | LICENSE is OSI-approved (MIT, Apache-2, BSD-*, ISC, MPL-2). | Users will inherit it. |
| B2 | Manifest declares **every** permission the code uses. Reviewer greps the source. | An undeclared permission = a trust break. |
| B3 | No code that uploads user content anywhere (file uploads, HTTP POSTs to non-`localhost`). Exception: the LLM router (which is the agent's responsibility, not yours). | Skills aren't channels. |
| B4 | No code that reads `~/.parix/.env`, `~/.parix/secrets/*`, `~/.parix/synapse-token`, `~/.parix/profile.json`. | The agent gives you what you need via `inputs`; you don't fish for it. |
| B5 | No `eval`, `exec`, `Function(...)`, dynamic imports of remote modules, `pip install` at runtime. | Skill code must be auditable in advance. |
| B6 | No outbound network calls to undeclared hostnames. The submission must list every hostname it talks to. | Lets users firewall the skill. |
| B7 | Tests exist and pass on Ubuntu in CI (we run them on PR). | Untested skills are not first-class. |
| B8 | No bundled binaries unless source + build script is in-tree. | "Trust me, this .so does what the README says" is not a defense. |
| B9 | No deceptive `id` — must not impersonate a first-party skill (e.g. `task-disk-cleanup-pro`). | Easy phishing vector. |
| B10 | The reversibility score is honest. Reviewer reads the code; a `rm -rf` with `reversibility: 0.9` is a ban, not a rejection. | This is the safety gate. |

### Warns

| | What | What we ask |
|---|---|---|
| W1 | Permission scope wider than necessary (e.g. `filesystem:write` for a read-only skill). | Tighten and resubmit. |
| W2 | Hard-coded paths or assumptions about the user's setup. | Make configurable via `inputs`. |
| W3 | English-only error messages with no i18n hook. | We'll merge but flag the language. |
| W4 | Test coverage < 50% on the main code path. | Bring it up. |
| W5 | Manifest description longer than 200 chars or written as marketing copy. | Trim, be honest. |

## What gets a skill banned (not just rejected)

These are bans — your GitHub identity is added to the marketplace
blocklist, and your skill is removed (with a public note on why).

- **Exfiltration** of any of: `~/.parix/secrets/*`, OS keyring,
  clipboard contents to a non-user-configured destination, accessibility
  snapshot history.
- **Self-elevation** — code that tries to grant itself permissions not
  in its manifest.
- **Manifest lying** — declared `reversibility: 0.9` while the code
  does destructive things.
- **Hidden network calls** to hostnames not in the submission's
  declared list.
- **Crypto miners / coordinated denial of service / known malware**
  family signatures.
- **Targeting other skills** — code that reads, modifies, or
  impersonates manifests of other installed skills.

## Disputes

If you think a rejection or ban was wrong:

1. Comment on the marketplace issue thread with the evidence.
2. A second reviewer is assigned within 5 working days.
3. If the second review agrees with you, the decision is reversed and
   the skill is listed.
4. If they don't, the decision stands. You can resubmit a new version
   (with a different `id`) after addressing the feedback.

We don't run an appeals court beyond the second review. The reviewer
pool is small; multi-stage appeals would block real work.

## Versioning & updates

- Every new release of a skill is a **new submission** (new manifest
  version, new tag). Reviewers spot-check the diff but re-run the
  blocker checks.
- We do not auto-update installed third-party skills. The user sees
  an "Update available" prompt with the diff summary.
- A previously-published skill that the author later edits to add an
  exfiltration call is a ban for the author, not a rejection of the
  next version.

## Reviewer training (internal)

If you're reviewing skills, read [docs/threat-model.md](threat-model.md)
first — Scenario S3 covers the malicious-skill case. The blocker list
above is a checklist, not a substitute for thinking about what the code
actually does.

## Reviewer board

For v0.2.0-alpha: Suhas is the only reviewer. Beyond Phase 2, the
reviewer pool expands to community contributors with at least 3 merged
PRs in the main repo.

## Skill removal request (by the author)

If you want your published skill removed:

1. Open an issue titled `[remove] <skill-id>`.
2. We unlist within 2 working days.
3. The skill stays in the immutable history (git tags don't disappear),
   but the marketplace API no longer serves it.
