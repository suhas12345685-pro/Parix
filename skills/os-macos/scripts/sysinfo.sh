#!/bin/bash
# Parix macOS System Info Script
# Collects key system metrics and outputs as JSON.

set -euo pipefail

cpu_count=$(sysctl -n hw.ncpu)
mem_bytes=$(sysctl -n hw.memsize)
mem_gb=$(echo "scale=2; $mem_bytes / 1073741824" | bc)
arch=$(uname -m)
os_version=$(sw_vers -productVersion)
hostname=$(hostname)
uptime_secs=$(sysctl -n kern.boottime | awk '{print $4}' | tr -d ',')
now=$(date +%s)
uptime_hours=$(echo "scale=1; ($now - $uptime_secs) / 3600" | bc)

# Disk usage for root volume
disk_info=$(df -g / | tail -1)
disk_total=$(echo "$disk_info" | awk '{print $2}')
disk_free=$(echo "$disk_info" | awk '{print $4}')

# Battery (if laptop)
battery="null"
if command -v pmset &>/dev/null; then
    batt_pct=$(pmset -g batt | grep -o '[0-9]*%' | tr -d '%' || echo "")
    if [ -n "$batt_pct" ]; then
        battery="$batt_pct"
    fi
fi

# Package manager
pkg_mgr="null"
if command -v brew &>/dev/null; then
    pkg_mgr="\"brew\""
fi

# Accessibility check
a11y="false"
if [ -f "/Library/Application Support/com.apple.TCC/TCC.db" ] 2>/dev/null; then
    a11y="\"check_system_settings\""
fi

cat <<EOF
{
  "hostname": "$hostname",
  "os_version": "macOS $os_version",
  "architecture": "$arch",
  "cpu_count": $cpu_count,
  "total_memory_gb": $mem_gb,
  "uptime_hours": $uptime_hours,
  "disk_total_gb": $disk_total,
  "disk_free_gb": $disk_free,
  "battery_percent": $battery,
  "package_manager": $pkg_mgr
}
EOF
