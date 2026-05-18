#!/bin/bash
# Parix Linux System Info Script
# Collects key system metrics and outputs as JSON.

set -euo pipefail

# Distro detection
distro_id="unknown"
distro_name="Unknown"
if [ -f /etc/os-release ]; then
    . /etc/os-release
    distro_id="${ID:-unknown}"
    distro_name="${PRETTY_NAME:-$ID}"
fi

# CPU
cpu_count=$(nproc)
cpu_model=$(grep -m1 'model name' /proc/cpuinfo | cut -d: -f2 | xargs)

# Memory
mem_total=$(awk '/MemTotal/ {printf "%.2f", $2/1048576}' /proc/meminfo)
mem_free=$(awk '/MemAvailable/ {printf "%.2f", $2/1048576}' /proc/meminfo)

# Disk (root partition)
disk_total=$(df -BG / | tail -1 | awk '{print $2}' | tr -d 'G')
disk_free=$(df -BG / | tail -1 | awk '{print $4}' | tr -d 'G')

# Uptime
uptime_secs=$(awk '{print int($1)}' /proc/uptime)
uptime_hours=$(echo "scale=1; $uptime_secs / 3600" | bc)

# Package manager
pkg_mgr="null"
for mgr in apt dnf pacman zypper; do
    if command -v "$mgr" &>/dev/null; then
        pkg_mgr="\"$mgr\""
        break
    fi
done

# Display server
display="${XDG_SESSION_TYPE:-none}"

# Desktop environment
desktop="${XDG_CURRENT_DESKTOP:-none}"

cat <<EOF
{
  "hostname": "$(hostname)",
  "distro_id": "$distro_id",
  "distro_name": "$distro_name",
  "kernel": "$(uname -r)",
  "architecture": "$(uname -m)",
  "cpu_model": "$cpu_model",
  "cpu_count": $cpu_count,
  "total_memory_gb": $mem_total,
  "free_memory_gb": $mem_free,
  "disk_total_gb": $disk_total,
  "disk_free_gb": $disk_free,
  "uptime_hours": $uptime_hours,
  "package_manager": $pkg_mgr,
  "display_server": "$display",
  "desktop": "$desktop"
}
EOF
