#!/usr/bin/env python3
"""Dev environment fixer: detects package manager and reinstalls deps."""

import os
import subprocess
import sys


LOCKFILE_MAP = {
    "pnpm-lock.yaml": "pnpm install",
    "yarn.lock": "yarn install",
    "bun.lockb": "bun install",
    "package-lock.json": "npm install",
    "package.json": "npm install",  # fallback
}

PYTHON_FILES = {
    "requirements.txt": "pip install -r requirements.txt",
    "Pipfile": "pipenv install",
    "pyproject.toml": "pip install -e .",
}


def detect_package_manager(project_dir):
    """Detect JS package manager from lockfiles."""
    for lockfile, cmd in LOCKFILE_MAP.items():
        if os.path.exists(os.path.join(project_dir, lockfile)):
            return lockfile, cmd
    return None, None


def detect_python_env(project_dir):
    """Detect Python dependency file."""
    for depfile, cmd in PYTHON_FILES.items():
        if os.path.exists(os.path.join(project_dir, depfile)):
            return depfile, cmd
    return None, None


def run_fix(cmd, project_dir, dry_run=True):
    print(f"  Command: {cmd}")
    print(f"  Dir:     {project_dir}")
    if dry_run:
        print("  [DRY RUN - not executed]")
        return True
    try:
        r = subprocess.run(
            cmd, shell=True, cwd=project_dir,
            capture_output=True, text=True, timeout=120
        )
        if r.returncode == 0:
            print("  Result: SUCCESS")
        else:
            print(f"  Result: FAILED\n  {r.stderr[:300]}")
        return r.returncode == 0
    except subprocess.TimeoutExpired:
        print("  Result: TIMEOUT (120s)")
        return False


def main():
    project_dir = sys.argv[1] if len(sys.argv) > 1 else os.getcwd()
    dry_run = "--execute" not in sys.argv

    if dry_run:
        print("DRY RUN (pass --execute to run commands)\n")

    print(f"Scanning: {project_dir}\n")

    # JS/Node
    lockfile, js_cmd = detect_package_manager(project_dir)
    if lockfile:
        print(f"== JS Dependencies (detected: {lockfile}) ==")
        run_fix(js_cmd, project_dir, dry_run)

    # Python
    depfile, py_cmd = detect_python_env(project_dir)
    if depfile:
        print(f"\n== Python Dependencies (detected: {depfile}) ==")
        run_fix(py_cmd, project_dir, dry_run)

    if not lockfile and not depfile:
        print("No dependency files found in this directory.")


if __name__ == "__main__":
    main()
