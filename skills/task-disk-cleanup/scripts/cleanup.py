#!/usr/bin/env python3
"""Disk cleanup: finds and removes temp/cache files safely."""

import os
import platform
import shutil
import time

DAYS_OLD = 7
CUTOFF = time.time() - (DAYS_OLD * 86400)

SAFE_NEVER_TOUCH = {"Documents", "Desktop", "Downloads", ".git", ".env"}


def get_temp_dirs():
    system = platform.system()
    dirs = []
    if system == "Windows":
        dirs.append(os.environ.get("TEMP", ""))
        local = os.environ.get("LOCALAPPDATA", "")
        if local:
            dirs.append(os.path.join(local, "Temp"))
    elif system == "Darwin":
        dirs.append("/tmp")
        dirs.append(os.path.expanduser("~/Library/Caches"))
    else:
        dirs.append("/tmp")
        dirs.append(os.path.expanduser("~/.cache"))
    return [d for d in dirs if d and os.path.isdir(d)]


def scan_old_files(directory, max_depth=2):
    """Yield files older than CUTOFF within max_depth levels."""
    base_depth = directory.rstrip(os.sep).count(os.sep)
    for root, dirs, files in os.walk(directory):
        depth = root.count(os.sep) - base_depth
        if depth >= max_depth:
            dirs.clear()
            continue
        dirs[:] = [d for d in dirs if d not in SAFE_NEVER_TOUCH]
        for f in files:
            path = os.path.join(root, f)
            try:
                if os.path.getmtime(path) < CUTOFF:
                    yield path
            except OSError:
                continue


def cleanup(dry_run=True):
    freed = 0
    for d in get_temp_dirs():
        for path in scan_old_files(d):
            try:
                size = os.path.getsize(path)
                if dry_run:
                    print(f"[DRY] {size:>10} B  {path}")
                else:
                    os.remove(path)
                freed += size
            except OSError:
                continue
    mb = freed / (1024 * 1024)
    label = "Would free" if dry_run else "Freed"
    print(f"\n{label}: {mb:.1f} MB")


if __name__ == "__main__":
    import sys
    dry = "--execute" not in sys.argv
    if dry:
        print("DRY RUN (pass --execute to actually delete)\n")
    cleanup(dry_run=dry)
