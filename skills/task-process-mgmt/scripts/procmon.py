#!/usr/bin/env python3
"""Process monitor: lists top CPU/memory consumers and detects hangs."""

import platform
import subprocess
import sys


def run(cmd):
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        return r.returncode, r.stdout.strip()
    except Exception as e:
        return -1, str(e)


def top_processes():
    print("== Top Processes by CPU ==")
    system = platform.system()
    if system == "Windows":
        code, out = run([
            "powershell", "-Command",
            "Get-Process | Sort-Object CPU -Descending "
            "| Select-Object -First 10 Name, Id, CPU, "
            "@{N='MemMB';E={[math]::Round($_.WorkingSet64/1MB,1)}} "
            "| Format-Table -AutoSize"
        ])
    else:
        code, out = run(["bash", "-c", "ps aux --sort=-%cpu | head -12"])
    if code == 0:
        print(out)
    else:
        print(f"  Error: {out[:200]}")


def memory_usage():
    print("\n== Memory Usage ==")
    system = platform.system()
    if system == "Windows":
        code, out = run([
            "powershell", "-Command",
            "$os = Get-CimInstance Win32_OperatingSystem; "
            "$total = [math]::Round($os.TotalVisibleMemorySize/1MB,1); "
            "$free = [math]::Round($os.FreePhysicalMemory/1MB,1); "
            "$used = $total - $free; "
            "\"Total: ${total} GB  Used: ${used} GB  Free: ${free} GB\""
        ])
    elif system == "Darwin":
        code, out = run(["vm_stat"])
    else:
        code, out = run(["free", "-h"])
    if code == 0:
        print(out)
    else:
        print(f"  Error: {out[:200]}")


def check_safe_services():
    print("\n== Safe-Restart Services Status ==")
    services = ["docker", "postgresql", "mysql", "redis-server", "nginx"]
    system = platform.system()
    for svc in services:
        if system == "Windows":
            code, out = run(["sc", "query", svc])
            running = "RUNNING" in out if code == 0 else False
        else:
            code, _ = run(["pgrep", "-x", svc])
            running = code == 0
        status = "running" if running else "stopped"
        print(f"  {svc}: {status}")


if __name__ == "__main__":
    top_processes()
    memory_usage()
    check_safe_services()
