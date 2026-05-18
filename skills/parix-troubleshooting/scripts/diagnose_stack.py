#!/usr/bin/env python3
"""Run a full diagnostic sweep of the Parix stack and report issues."""

import subprocess
import sys
import socket
import os


def check_port(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(2)
        return s.connect_ex(("127.0.0.1", port)) == 0


def run_cmd(args, timeout=10):
    try:
        r = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
        return r.returncode, r.stdout.strip(), r.stderr.strip()
    except FileNotFoundError:
        return -1, "", f"{args[0]} not found"
    except subprocess.TimeoutExpired:
        return -1, "", "timeout"


def main():
    issues = []
    print("Parix Diagnostic Report")
    print("=" * 55)

    # PM2 status
    code, out, err = run_cmd(["npx", "pm2", "jlist"], timeout=15)
    if code == 0:
        import json
        procs = json.loads(out)
        for p in procs:
            name = p["name"]
            status = p["pm2_env"]["status"]
            print(f"  PM2 {name:<20} {status}")
            if status != "online":
                issues.append(f"{name} is {status}")
    else:
        print(f"  PM2 check failed: {err}")
        issues.append("PM2 not running or not installed")

    # Port checks
    print("\nPort Availability:")
    for label, port in [("Hands", 8765), ("Relay", 8766), ("UI", 3000)]:
        up = check_port(port)
        print(f"  {label:<12} :{port}  {'UP' if up else 'DOWN'}")
        if not up:
            issues.append(f"{label} port {port} not responding")

    # .env check
    env_path = os.path.join(os.getcwd(), ".env")
    if os.path.isfile(env_path):
        print(f"\n.env: found at {env_path}")
    else:
        print("\n.env: NOT FOUND")
        issues.append(".env file missing")

    # Summary
    print("\n" + "=" * 55)
    if issues:
        print(f"Found {len(issues)} issue(s):")
        for i in issues:
            print(f"  - {i}")
        sys.exit(1)
    else:
        print("No issues detected.")


if __name__ == "__main__":
    main()
