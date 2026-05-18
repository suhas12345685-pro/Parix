"""Docker cleanup — prune dangling images, stopped containers, unused volumes.

Usage: python prune.py [--dry-run]
"""

import argparse
import json
import subprocess
import sys


def run_docker(args: list[str], dry_run: bool = False) -> dict:
    cmd = ["docker"] + args
    if dry_run:
        return {"command": " ".join(cmd), "dry_run": True, "output": ""}
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        return {
            "command": " ".join(cmd),
            "success": result.returncode == 0,
            "output": result.stdout.strip(),
            "error": result.stderr.strip() if result.returncode != 0 else None,
        }
    except FileNotFoundError:
        return {"command": " ".join(cmd), "success": False, "error": "docker not found"}
    except subprocess.TimeoutExpired:
        return {"command": " ".join(cmd), "success": False, "error": "timeout"}


def prune(dry_run: bool = False) -> list[dict]:
    results = []
    results.append(run_docker(["container", "prune", "-f"], dry_run))
    results.append(run_docker(["image", "prune", "-f"], dry_run))
    results.append(run_docker(["volume", "prune", "-f"], dry_run))
    results.append(run_docker(["network", "prune", "-f"], dry_run))
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    results = prune(args.dry_run)
    print(json.dumps(results, indent=2))
