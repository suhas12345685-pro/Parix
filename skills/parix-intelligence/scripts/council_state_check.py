#!/usr/bin/env python3
"""Query the latest Council state from the checkpoints table."""

import os
import sys
import json

try:
    import sqlite3
except ImportError:
    print("[ERROR] sqlite3 not available")
    sys.exit(1)

PROJECT_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..")
)
DB_PATH = os.path.join(PROJECT_ROOT, "data", "parix.db")

if not os.path.exists(DB_PATH):
    print(f"[WARN] Database not found: {DB_PATH}")
    sys.exit(1)

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

# Latest checkpoint
cursor.execute("""
    SELECT ts, council_state, active_task, queue_size
    FROM checkpoints ORDER BY ts DESC LIMIT 1
""")
row = cursor.fetchone()

print("=== Council State ===\n")
if row:
    ts, state, task, queue = row
    print(f"  Timestamp:    {ts}")
    print(f"  State:        {state}")
    print(f"  Active Task:  {task or 'None'}")
    print(f"  Queue Size:   {queue}")
else:
    print("  No checkpoints found.")

# Recent audit entries
cursor.execute("""
    SELECT ts, actor, action FROM audit_ledger
    ORDER BY ts DESC LIMIT 10
""")
rows = cursor.fetchall()

if rows:
    print(f"\n  Last 10 audit entries:")
    for ts, actor, action in rows:
        print(f"    [{ts}] {actor}: {action}")

# Governor stats
cursor.execute("""
    SELECT COUNT(*) FROM token_usage
    WHERE ts > datetime('now', '-1 hour')
""")
hourly = cursor.fetchone()[0]
print(f"\n  LLM calls (last hour): {hourly}")

conn.close()
