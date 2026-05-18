#!/usr/bin/env python3
"""Audit constitution rules: list blocked and allowed command patterns."""

import json
import os
import re
import sys

PROJECT_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..")
)

CONSTITUTION_PATH = os.path.join(
    PROJECT_ROOT, "atrium", "src", "intelligence", "constitution.ts"
)

if not os.path.exists(CONSTITUTION_PATH):
    print(f"[WARN] constitution.ts not found at {CONSTITUTION_PATH}")
    print("       Expected: atrium/src/intelligence/constitution.ts")
    sys.exit(1)

with open(CONSTITUTION_PATH, "r", encoding="utf-8") as f:
    content = f.read()

# Extract patterns from BLOCKED_COMMANDS and DOMAIN_BLOCKED_COMMANDS arrays
blocked = re.findall(r"pattern:\s*/(.+?)/", content)
allowed = re.findall(r"(?:ALLOWED|allowList).*?/(.+?)/", content, re.DOTALL)

print("=== Constitution Rule Audit ===\n")
print(f"Blocked patterns ({len(blocked)}):")
for p in blocked:
    print(f"  BLOCK  {p}")

print(f"\nAllowed patterns ({len(allowed)}):")
for p in allowed:
    print(f"  ALLOW  {p}")

print(f"\nTotal: {len(blocked)} blocked, {len(allowed)} allowed")
