#!/usr/bin/env python3
"""Verify Parix onboarding prerequisites without running the full wizard."""

import shutil
import subprocess
import sys
import os


def check_binary(name, min_version_parts=None):
    path = shutil.which(name)
    if not path:
        return False, f"{name} not found on PATH"
    try:
        out = subprocess.check_output([path, "--version"], text=True, timeout=10)
        version_line = out.strip().splitlines()[0]
        return True, version_line
    except Exception as e:
        return False, str(e)


def check_python_package(pkg):
    try:
        __import__(pkg)
        return True
    except ImportError:
        return False


def main():
    checks = []

    ok, info = check_binary("python")
    checks.append(("Python", ok, info))

    ok, info = check_binary("node")
    checks.append(("Node.js", ok, info))

    ok, info = check_binary("npm")
    checks.append(("npm", ok, info))

    ok, info = check_binary("git")
    checks.append(("git", ok, info))

    for pkg in ["mss", "websockets", "dotenv"]:
        found = check_python_package(pkg)
        checks.append((f"pip:{pkg}", found, "installed" if found else "MISSING"))

    env_path = os.path.join(os.getcwd(), ".env")
    has_env = os.path.isfile(env_path)
    checks.append((".env file", has_env, env_path if has_env else "NOT FOUND"))

    print(f"\n{'Check':<20} {'Status':<8} {'Details'}")
    print("-" * 60)
    failed = 0
    for name, ok, detail in checks:
        status = "OK" if ok else "FAIL"
        if not ok:
            failed += 1
        print(f"{name:<20} {status:<8} {detail}")

    print(f"\n{len(checks) - failed}/{len(checks)} checks passed.")
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
