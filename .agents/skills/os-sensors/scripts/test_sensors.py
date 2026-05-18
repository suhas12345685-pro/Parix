"""Quick sensor smoke test — runs each sensor's detection once and reports.

Usage: python test_sensors.py
"""

import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

results = {}

# Terminal error detection
from hands.sensors.terminal_error import detect_terminal_error
ev = detect_terminal_error("npm ERR! code E404\nnpm ERR! 404 Not Found")
results["terminal_error"] = {"detected": ev is not None, "confidence": ev.confidence if ev else 0}

# Watcher scoring
from hands.sensors.watcher import score_output
conf, tags = score_output("Traceback (most recent call last):\n  TypeError: bad arg")
results["watcher_score"] = {"confidence": conf, "tags": tags}

# Clipboard detection
from hands.sensors.clipboard_watch import detect_sensitive_clipboard
ev = detect_sensitive_clipboard("my password=SuperSecret123!")
results["clipboard"] = {"detected": ev is not None}

# Wi-Fi check
from hands.sensors.wifi_watch import check_connectivity
state = check_connectivity()
results["wifi"] = {"connected": state["connected"], "ssid": state.get("ssid")}

# USB listing
from hands.sensors.usb_watch import list_usb_devices
devices = list_usb_devices()
results["usb"] = {"device_count": len(devices)}

# Shadow loop
from hands.sensors.shadow_loop import sweep
events = sweep()
results["shadow_loop"] = {"events": len(events), "types": [e.event_type for e in events]}

print(json.dumps(results, indent=2, default=str))
