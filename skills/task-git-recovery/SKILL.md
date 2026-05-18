---
name: task-git-recovery
description: Skill — Git Recovery
---

# Skill — Git Recovery

> Triggered on `terminal_error` events containing git-related errors: merge conflicts, detached HEAD, failed pushes, corrupted index.

## Error → Fix Mapping

| Error Pattern | Response | Auto-fix? |
|---|---|---|
| `MERGE_CONFLICT` | Notify with conflicted file list | No |
| `fatal: not a git repository` | Notify: suggest `git init` | No |
| `error: failed to push some refs` | Notify: suggest `git pull --rebase` | No |
| `detached HEAD` | Notify: suggest `git checkout -b <branch>` | No |
| `fatal: refusing to merge unrelated histories` | Notify: explain `--allow-unrelated-histories` | No |
| `fatal: index file corrupt` | `rm .git/index && git reset` | Yes (0.7) |
| `error: Your local changes would be overwritten` | Notify: suggest `git stash` first | No |
| `fatal: unable to access` (SSL/auth) | Notify: check credentials/VPN | No |

## Principles

1. **Git is sacred.** Never auto-run destructive git operations (`reset --hard`, `push --force`, `clean -fd`, `branch -D`).
2. **Notification is the default.** Most git issues require user judgment.
3. **Only auto-fix** truly safe operations: rebuilding a corrupt index (recoverable via `git reset`).
4. **Always explain why** the error happened and what the user should do.

## Merge Conflict Guidance

When merge conflict is detected:
1. List conflicted files: `git diff --name-only --diff-filter=U`
2. Notify with: "Merge conflict in N files. Open them, resolve the `<<<<<<<` markers, then `git add` and `git commit`."
3. Never auto-resolve conflicts.

## Stash Recovery

If the user's changes would be overwritten:
1. Suggest: `git stash` to save changes
2. Then: `git pull` to update
3. Then: `git stash pop` to reapply changes
4. If stash pop conflicts: notify with file list
