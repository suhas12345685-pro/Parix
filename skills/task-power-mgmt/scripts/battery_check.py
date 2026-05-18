"""Quick battery and uptime check.

Usage: python battery_check.py
Reports battery level, charging status, and system uptime.
"""

import json
import subprocess
import sys
import time


def get_battery() -> dict:
    if sys.platform == "win32":
        try:
            out = subprocess.run(
                ["powershell", "-NoProfile", "-Command",
                 "(Get-WmiObject Win32_Battery | Select BatteryStatus, EstimatedChargeRemaining) | ConvertTo-Json"],
                capture_output=True, text=True, timeout=5,
            )
            data = json.loads(out.stdout) if out.stdout.strip() else {}
            pct = data.get("EstimatedChargeRemaining")
            charging = data.get("BatteryStatus", 0) == 2
            return {"percent": pct, "charging": charging}
        except Exception:
            return {"percent": None, "charging": None}
    elif sys.platform == "darwin":
        try:
            out = subprocess.run(
                ["pmset", "-g", "batt"], capture_output=True, text=True, timeout=3,
            )
            for line in out.stdout.splitlines():
                if "%" in line:
                    pct = int(line.split("%")[0].split()[-1])
                    charging = "charging" in line.lower() or "AC" in line
                    return {"percent": pct, "charging": charging}
        except Exception:
            pass
    return {"percent": None, "charging": None}


def get_uptime_hours() -> float | None:
    try:
        if sys.platform == "win32":
            out = subprocess.run(
                ["powershell", "-NoProfile", "-Command",
                 "(Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime | Select -Expand TotalHours"],
                capture_output=True, text=True, timeout=5,
            )
            return round(float(out.stdout.strip()), 1)
        else:
            with open("/proc/uptime") as f:
                return round(float(f.read().split()[0]) / 3600, 1)
    except Exception:
        return None


if __name__ == "__main__":
    report = {
        "battery": get_battery(),
        "uptime_hours": get_uptime_hours(),
        "timestamp": time.time(),
    }
    print(json.dumps(report, indent=2))
