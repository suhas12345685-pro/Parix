#!/usr/bin/env python3
"""Quick sensor smoke test: run each sensor check once and print results."""

import os
import sys
import platform
import json

try:
    import psutil
except ImportError:
    print("[ERROR] psutil not installed: pip install psutil")
    sys.exit(1)


def check_disk():
    usage = psutil.disk_usage("/")
    pct = usage.percent
    return {
        "event_type": "disk_low" if pct > 90 else "disk_ok",
        "data": {"percent": pct, "free_gb": round(usage.free / (1024**3), 2)},
        "confidence": 0.95,
    }


def check_cpu():
    pct = psutil.cpu_percent(interval=1)
    return {
        "event_type": "cpu_high" if pct > 80 else "cpu_ok",
        "data": {"percent": pct},
        "confidence": 0.90,
    }


def check_memory():
    mem = psutil.virtual_memory()
    return {
        "event_type": "memory_high" if mem.percent > 85 else "memory_ok",
        "data": {"percent": mem.percent, "available_gb": round(mem.available / (1024**3), 2)},
        "confidence": 0.95,
    }


def check_battery():
    batt = psutil.sensors_battery()
    if batt is None:
        return {"event_type": "battery_na", "data": {}, "confidence": 1.0}
    return {
        "event_type": "battery_low" if batt.percent < 20 else "battery_ok",
        "data": {"percent": batt.percent, "plugged": batt.power_plugged},
        "confidence": 0.95,
    }


def check_uptime():
    import time
    boot = psutil.boot_time()
    hours = (time.time() - boot) / 3600
    return {
        "event_type": "long_uptime" if hours > 72 else "uptime_ok",
        "data": {"hours": round(hours, 1)},
        "confidence": 0.90,
    }


print(f"=== Sensor Smoke Test ({platform.system()}) ===\n")

checks = [check_disk, check_cpu, check_memory, check_battery, check_uptime]
for fn in checks:
    result = fn()
    status = "ALERT" if "_ok" not in result["event_type"] and "_na" not in result["event_type"] else "OK"
    print(f"  [{status:5s}] {result['event_type']:<20s} {json.dumps(result['data'])}")

print("\n  Done.")
