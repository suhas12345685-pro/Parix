#!/usr/bin/env python3
"""Git recovery: diagnose common git errors and suggest fixes."""

import os
import subprocess
import sys


def run(cmd, cwd=None):
    try:
        r = subprocess.run(
            cmd, capture_output=True, text=True, timeout=15, cwd=cwd
        )
        return r.returncode, r.stdout.strip(), r.stderr.strip()
    except Exception as e:
        return -1, "", str(e)


def check_git_repo(repo_dir):
    code, out, err = run(["git", "rev-parse", "--is-inside-work-tree"], repo_dir)
    return code == 0


def check_index(repo_dir):
    index_path = os.path.join(repo_dir, ".git", "index")
    if not os.path.exists(index_path):
        print("  WARNING: .git/index missing")
        return False
    code, _, err = run(["git", "status"], repo_dir)
    if "index file corrupt" in err.lower():
        print("  ERROR: Corrupt index detected")
        print("  FIX: rm .git/index && git reset")
        return False
    return True


def check_head(repo_dir):
    code, out, _ = run(["git", "symbolic-ref", "HEAD"], repo_dir)
    if code != 0:
        print("  WARNING: Detached HEAD state")
        _, commit, _ = run(["git", "rev-parse", "--short", "HEAD"], repo_dir)
        print(f"  Current commit: {commit}")
        print("  FIX: git checkout -b <new-branch-name>")
        return False
    print(f"  Branch: {out.replace('refs/heads/', '')}")
    return True


def check_conflicts(repo_dir):
    code, out, _ = run(
        ["git", "diff", "--name-only", "--diff-filter=U"], repo_dir
    )
    if out:
        files = out.splitlines()
        print(f"  CONFLICT: {len(files)} file(s) with merge conflicts:")
        for f in files[:10]:
            print(f"    - {f}")
        return False
    return True


def check_stash(repo_dir):
    code, out, _ = run(["git", "stash", "list"], repo_dir)
    if out:
        count = len(out.splitlines())
        print(f"  INFO: {count} stash(es) found")


def main():
    repo_dir = sys.argv[1] if len(sys.argv) > 1 else os.getcwd()
    print(f"Git Health Check: {repo_dir}\n")

    if not check_git_repo(repo_dir):
        print("Not a git repository. Run 'git init' to initialize.")
        sys.exit(1)

    print("== Index ==")
    check_index(repo_dir)

    print("\n== HEAD ==")
    check_head(repo_dir)

    print("\n== Merge Conflicts ==")
    ok = check_conflicts(repo_dir)
    if ok:
        print("  No conflicts")

    print("\n== Stash ==")
    check_stash(repo_dir)

    print("\nDone.")


if __name__ == "__main__":
    main()
