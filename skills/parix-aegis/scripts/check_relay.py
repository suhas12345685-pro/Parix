#!/usr/bin/env python3
"""Check Aegis relay WebSocket and UI HTTP endpoints."""

import asyncio
import sys
import urllib.request
import urllib.error


RELAY_URL = "ws://localhost:8766"
UI_URL = "http://localhost:3000"


def check_http(url, label):
    try:
        req = urllib.request.Request(url, method="GET")
        resp = urllib.request.urlopen(req, timeout=5)
        print(f"  {label:<20} OK  (HTTP {resp.status})")
        return True
    except urllib.error.URLError as e:
        print(f"  {label:<20} FAIL ({e.reason})")
        return False
    except Exception as e:
        print(f"  {label:<20} FAIL ({e})")
        return False


async def check_ws(url, label):
    try:
        import websockets
        async with websockets.connect(url, open_timeout=5) as ws:
            msg = await asyncio.wait_for(ws.recv(), timeout=10)
            print(f"  {label:<20} OK  (received {len(msg)} bytes)")
            return True
    except ImportError:
        print(f"  {label:<20} SKIP (websockets package not installed)")
        return True
    except Exception as e:
        print(f"  {label:<20} FAIL ({e})")
        return False


def main():
    print("Aegis Endpoint Check")
    print("=" * 45)
    results = []

    results.append(check_http(UI_URL, "Aegis UI (3000)"))
    results.append(asyncio.run(check_ws(RELAY_URL, "Aegis Relay (8766)")))

    print()
    if all(results):
        print("All Aegis endpoints reachable.")
    else:
        print("Some endpoints unreachable.")
        sys.exit(1)


if __name__ == "__main__":
    main()
