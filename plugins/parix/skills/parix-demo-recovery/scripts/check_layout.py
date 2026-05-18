from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[5]


REQUIRED = [
    "shared/protocol.json",
    "hands/main.py",
    "hands/protocol.py",
    "atrium/src/synapse/client.ts",
    "atrium/src/memory/db.ts",
]


def main() -> int:
    missing = [path for path in REQUIRED if not (ROOT / path).exists()]
    protocol = json.loads((ROOT / "shared/protocol.json").read_text(encoding="utf-8"))
    ports = protocol.get("ports", {})
    expected = {"synapse": 8765, "aegis_relay": 8766, "aegis_ui": 3000}
    bad_ports = {key: ports.get(key) for key, value in expected.items() if ports.get(key) != value}

    if missing or bad_ports:
        if missing:
            print("missing:", ", ".join(missing))
        if bad_ports:
            print("bad_ports:", bad_ports)
        return 1

    print("parix layout ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
