"""Run a command safely and print the result as JSON.

Usage: python safe_run.py <command...>
Example: python safe_run.py git status
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from hands.executor.cli import run_sync

if __name__ == "__main__":
    argv = sys.argv[1:]
    if not argv:
        print(json.dumps({"error": "no command provided"}))
        sys.exit(1)
    result = run_sync(argv, timeout=30)
    print(json.dumps(result, indent=2, default=str))
