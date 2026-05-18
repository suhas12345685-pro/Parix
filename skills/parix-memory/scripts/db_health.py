#!/usr/bin/env python3
"""Check Parix SQLite database health: table existence, row counts, size."""

import os
import sys

try:
    import sqlite3
except ImportError:
    print("[ERROR] sqlite3 not available")
    sys.exit(1)

PROJECT_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..")
)
DB_PATH = os.path.join(PROJECT_ROOT, "data", "parix.db")

EXPECTED_TABLES = [
    "events", "tasks", "audit_ledger", "skill_cache",
    "token_usage", "daily_summary", "checkpoints",
    "episodes", "event_sequences", "surprises",
]

if not os.path.exists(DB_PATH):
    print(f"[WARN] Database not found: {DB_PATH}")
    print("       Run Parix once to initialize the database.")
    sys.exit(1)

size_kb = os.path.getsize(DB_PATH) / 1024
print(f"=== Parix DB Health Check ===\n")
print(f"  Path: {DB_PATH}")
print(f"  Size: {size_kb:.1f} KB\n")

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

# Get actual tables
cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
actual = {row[0] for row in cursor.fetchall()}

print(f"{'Table':<25} {'Status':<10} {'Rows':>8}")
print("-" * 45)

for table in EXPECTED_TABLES:
    if table in actual:
        cursor.execute(f"SELECT COUNT(*) FROM [{table}]")
        count = cursor.fetchone()[0]
        print(f"  {table:<23} {'OK':<10} {count:>8}")
    else:
        print(f"  {table:<23} {'MISSING':<10} {'--':>8}")

# Check for unexpected tables
extra = actual - set(EXPECTED_TABLES) - {"sqlite_sequence"}
if extra:
    print(f"\n  Extra tables: {', '.join(extra)}")

conn.close()
print("\n  Done.")
