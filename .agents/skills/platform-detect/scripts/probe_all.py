"""Probe the current platform and print all detected capabilities."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from hands.platform import detect_os, detect_arch, detect_distro, probe_capability

CAPABILITIES = ["accessibility", "screenshot", "clipboard", "notifications", "package_manager"]

result = {
    "os": detect_os(),
    "arch": detect_arch(),
    "distro": detect_distro(),
    "capabilities": {cap: probe_capability(cap) for cap in CAPABILITIES},
}

print(json.dumps(result, indent=2))
