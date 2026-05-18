"""Parse log files for anomalies and known error patterns.

Usage: python logparse.py <logfile> [--tail 100]
"""

import argparse
import json
import re
import sys
from collections import Counter

ERROR_PATTERNS = [
    (re.compile(r"\berror\b", re.IGNORECASE), "error"),
    (re.compile(r"\bwarn(?:ing)?\b", re.IGNORECASE), "warning"),
    (re.compile(r"\bcritical\b", re.IGNORECASE), "critical"),
    (re.compile(r"\bfatal\b", re.IGNORECASE), "fatal"),
    (re.compile(r"\btimeout\b", re.IGNORECASE), "timeout"),
    (re.compile(r"\bOOM\b|out of memory", re.IGNORECASE), "oom"),
    (re.compile(r"\bpanic\b", re.IGNORECASE), "panic"),
    (re.compile(r"stack\s*trace|traceback", re.IGNORECASE), "stacktrace"),
]


def analyze(lines: list[str]) -> dict:
    counts: Counter = Counter()
    samples: dict[str, str] = {}

    for line in lines:
        for pattern, tag in ERROR_PATTERNS:
            if pattern.search(line):
                counts[tag] += 1
                if tag not in samples:
                    samples[tag] = line.strip()[:200]

    return {
        "total_lines": len(lines),
        "anomaly_counts": dict(counts),
        "first_samples": samples,
        "health": "critical" if counts.get("fatal") or counts.get("oom") or counts.get("panic")
                  else "degraded" if sum(counts.values()) > 10
                  else "ok",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("logfile")
    parser.add_argument("--tail", type=int, default=500)
    args = parser.parse_args()

    try:
        with open(args.logfile, encoding="utf-8", errors="replace") as f:
            lines = f.readlines()[-args.tail:]
    except FileNotFoundError:
        print(json.dumps({"error": f"file not found: {args.logfile}"}))
        sys.exit(1)

    print(json.dumps(analyze(lines), indent=2))
