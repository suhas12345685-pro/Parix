#!/usr/bin/env python3
"""Check if the Synapse WebSocket bridge is running and responsive."""

import asyncio
import json
import sys
import time

try:
    import websockets
except ImportError:
    print("[ERROR] websockets not installed: pip install websockets")
    sys.exit(1)

HOST = "localhost"
PORT = 8765
TIMEOUT = 5


async def check_bridge():
    uri = f"ws://{HOST}:{PORT}"
    print(f"Connecting to Synapse bridge at {uri} ...")

    try:
        async with websockets.connect(uri, open_timeout=TIMEOUT) as ws:
            # Send a heartbeat
            heartbeat = json.dumps({
                "type": "HEARTBEAT",
                "timestamp": time.time()
            })
            await ws.send(heartbeat)
            print(f"  Sent HEARTBEAT")

            # Wait for response
            try:
                response = await asyncio.wait_for(ws.recv(), timeout=TIMEOUT)
                data = json.loads(response)
                print(f"  Received: {data.get('type', 'unknown')}")
                print(f"\n[OK] Synapse bridge is alive on port {PORT}")
                return 0
            except asyncio.TimeoutError:
                print(f"  No response within {TIMEOUT}s (bridge may not echo HB)")
                print(f"\n[OK] Connection succeeded, no heartbeat echo")
                return 0

    except ConnectionRefusedError:
        print(f"\n[FAIL] Connection refused on port {PORT}")
        print("  Hands process may not be running.")
        print("  Try: npx pm2 start ecosystem.config.js")
        return 1
    except Exception as e:
        print(f"\n[FAIL] {type(e).__name__}: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(check_bridge()))
