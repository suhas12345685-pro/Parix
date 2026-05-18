#!/usr/bin/env python3
"""Network diagnostics: gateway ping, DNS check, interface status."""

import platform
import subprocess
import sys


def run(cmd, timeout=10):
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return r.returncode, r.stdout.strip()
    except (subprocess.TimeoutExpired, FileNotFoundError) as e:
        return -1, str(e)


def check_gateway():
    print("== Gateway Ping ==")
    system = platform.system()
    if system == "Windows":
        code, out = run(["ping", "-n", "3", "8.8.8.8"])
    else:
        code, out = run(["ping", "-c", "3", "8.8.8.8"])
    status = "OK" if code == 0 else "FAIL"
    print(f"  Status: {status}")
    if code != 0:
        print(f"  Output: {out[:200]}")
    return code == 0


def check_dns():
    print("\n== DNS Resolution ==")
    code, out = run(["nslookup", "google.com"])
    status = "OK" if code == 0 else "FAIL"
    print(f"  Status: {status}")
    if code != 0:
        print(f"  Output: {out[:200]}")
    return code == 0


def check_interface():
    print("\n== Interface Status ==")
    system = platform.system()
    if system == "Windows":
        code, out = run(["netsh", "interface", "show", "interface"])
    elif system == "Darwin":
        code, out = run(["ifconfig", "en0"])
    else:
        code, out = run(["ip", "link", "show"])
    if code == 0:
        for line in out.splitlines()[:10]:
            print(f"  {line}")
    else:
        print(f"  Could not query interfaces: {out[:200]}")
    return code == 0


def main():
    results = {
        "gateway": check_gateway(),
        "dns": check_dns(),
        "interface": check_interface(),
    }
    print("\n== Summary ==")
    all_ok = all(results.values())
    for name, ok in results.items():
        print(f"  {name}: {'PASS' if ok else 'FAIL'}")
    if all_ok:
        print("\nAll checks passed.")
    else:
        print("\nSome checks failed. See details above.")
    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    main()
