#!/usr/bin/env python3
"""Verify all Parix installation dependencies are present and meet minimum versions."""

import shutil
import subprocess
import sys
import re


REQUIREMENTS = {
    "python": {"cmd": ["python", "--version"], "min": (3, 12)},
    "node": {"cmd": ["node", "--version"], "min": (20, 0)},
    "npm": {"cmd": ["npm", "--version"], "min": (9, 0)},
    "git": {"cmd": ["git", "--version"], "min": (2, 0)},
}


def parse_version(text):
    match = re.search(r"(\d+)\.(\d+)", text)
    if match:
        return (int(match.group(1)), int(match.group(2)))
    return (0, 0)


def check(name, spec):
    binary = shutil.which(spec["cmd"][0])
    if not binary:
        return False, "not found on PATH", (0, 0)
    try:
        out = subprocess.check_output(spec["cmd"], text=True, timeout=10)
        ver = parse_version(out)
        ok = ver >= spec["min"]
        return ok, out.strip().splitlines()[0], ver
    except Exception as e:
        return False, str(e), (0, 0)


def main():
    print("Parix Dependency Verification")
    print("=" * 50)
    all_ok = True
    for name, spec in REQUIREMENTS.items():
        ok, info, ver = check(name, spec)
        min_str = ".".join(str(v) for v in spec["min"])
        status = "PASS" if ok else "FAIL"
        if not ok:
            all_ok = False
        print(f"  {name:<10} {status:<6} {info:<40} (need >= {min_str})")

    print()
    if all_ok:
        print("All dependencies satisfied.")
    else:
        print("Some dependencies are missing or outdated.")
        sys.exit(1)


if __name__ == "__main__":
    main()
