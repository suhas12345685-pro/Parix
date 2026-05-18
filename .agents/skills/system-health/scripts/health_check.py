"""One-shot system health check — runs sweep() and prints results."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from hands.sensors.shadow_loop import sweep

events = sweep()
if events:
    for ev in events:
        print(f"[{ev['event_type']}] confidence={ev['confidence']}")
        print(f"  data: {json.dumps(ev['data'], indent=4)}")
else:
    print("All clear — no health alerts.")
