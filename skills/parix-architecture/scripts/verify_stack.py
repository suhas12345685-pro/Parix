#!/usr/bin/env python3
"""Verify that all Parix stack directories and key files exist."""

import os
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(BASE, "..", "..", ".."))

EXPECTED = {
    "atrium/": "Brain (Node.js/TypeScript)",
    "hands/": "Body (Python)",
    "aegis/": "Dashboard UI (React)",
    "shared/": "Protocol + schema contracts",
    "skills/": "Agent reference docs",
    "deploy/": "Platform installers",
    "shared/protocol.json": "Synapse protocol schema",
    "shared/schema.sql": "SQLite table definitions",
    "hands/main.py": "Hands entry point",
}

missing = []
present = []

for path, desc in EXPECTED.items():
    full = os.path.join(PROJECT_ROOT, path)
    exists = os.path.exists(full)
    status = "OK" if exists else "MISSING"
    line = f"  [{status}] {path:40s} {desc}"
    if exists:
        present.append(line)
    else:
        missing.append(line)

print("=== Parix Stack Verification ===\n")
for line in present:
    print(line)
for line in missing:
    print(line)

print(f"\n  {len(present)} found, {len(missing)} missing")
sys.exit(1 if missing else 0)
