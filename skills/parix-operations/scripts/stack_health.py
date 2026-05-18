#!/usr/bin/env python3
"""Quick health check for all Parix stack services via PM2 and HTTP probes."""

import subprocess
import sys
import urllib.request
import urllib.error


SERVICES = [
    {"name": "Hands Synapse", "port": 8765, "url": None},
    {"name": "Aegis Relay", "port": 8766, "url": None},
    {"name": "Aegis UI", "port": 3000, "url": "http://localhost:3000"},
]


def check_pm2():
    try:
        out = subprocess.check_output(
            ["npx", "pm2", "jlist"], text=True, timeout=15
        )
        import json
        procs = json.loads(out)
        return {p["name"]: p["pm2_env"]["status"] for p in procs}
    except Exception as e:
        print(f"  PM2 check failed: {e}")
        return {}


def check_http(svc):
    if not svc["url"]:
        return None
    try:
        resp = urllib.request.urlopen(svc["url"], timeout=5)
        return resp.status
    except Exception:
        return False


def main():
    print("Parix Stack Health")
    print("=" * 50)

    pm2 = check_pm2()
    if pm2:
        print("\nPM2 Processes:")
        for name, status in pm2.items():
            icon = "OK" if status == "online" else "WARN"
            print(f"  {name:<20} {icon:<6} ({status})")
    else:
        print("\nPM2: no processes found or PM2 not running.")

    print("\nHTTP Probes:")
    all_ok = True
    for svc in SERVICES:
        result = check_http(svc)
        if result is None:
            print(f"  {svc['name']:<20} SKIP (no HTTP endpoint)")
        elif result:
            print(f"  {svc['name']:<20} OK   (HTTP {result})")
        else:
            print(f"  {svc['name']:<20} FAIL")
            all_ok = False

    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    main()
