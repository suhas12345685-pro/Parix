# Git Recovery Quick Reference

## Error-to-Fix Lookup

| Error | Safe Auto-fix? | Suggested Command |
|---|---|---|
| Corrupt index | Yes | `rm .git/index && git reset` |
| Merge conflicts | No | Resolve manually, `git add`, `git commit` |
| Detached HEAD | No | `git checkout -b <name>` |
| Push rejected | No | `git pull --rebase` then push |
| Local changes overwritten | No | `git stash`, pull, `git stash pop` |
| Unrelated histories | No | `--allow-unrelated-histories` |
| Auth/SSL failure | No | Check creds, VPN, SSH keys |

## Stash Workflow

```bash
git stash               # save changes
git pull                # update branch
git stash pop           # reapply changes
git stash list          # see all stashes
git stash drop stash@{0}  # remove specific stash
```

## Conflict Resolution

```bash
# List conflicted files
git diff --name-only --diff-filter=U

# After resolving markers (<<<<<<<, =======, >>>>>>>)
git add <file>
git commit
```

## Dangerous Commands (Never Auto-Run)

| Command | Risk |
|---|---|
| `git reset --hard` | Destroys uncommitted changes |
| `git push --force` | Overwrites remote history |
| `git clean -fd` | Deletes untracked files |
| `git branch -D` | Force-deletes branch |
| `git checkout -- .` | Discards all changes |

## Recovery from Mistakes

```bash
# Find lost commits
git reflog

# Recover deleted branch
git checkout -b <branch> <commit-hash>

# Undo last commit (keep changes)
git reset --soft HEAD~1
```
