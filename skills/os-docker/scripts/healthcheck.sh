#!/bin/bash
# Parix Docker Health Check Script
# Checks status of Parix containers and outputs a JSON report.

set -euo pipefail

COMPOSE_FILE="${PARIX_COMPOSE_FILE:-deploy/docker/docker-compose.yml}"

# Check if docker/podman is available
RUNTIME="docker"
if ! command -v docker &>/dev/null; then
    if command -v podman &>/dev/null; then
        RUNTIME="podman"
    else
        echo '{"error": "Neither docker nor podman found"}'
        exit 1
    fi
fi

# Get container statuses
atrium_status=$($RUNTIME inspect --format='{{.State.Status}}' parix-atrium 2>/dev/null || echo "not_found")
hands_status=$($RUNTIME inspect --format='{{.State.Status}}' parix-hands 2>/dev/null || echo "not_found")

# Health check endpoints
atrium_health="unhealthy"
if [ "$atrium_status" = "running" ]; then
    if curl -sf http://localhost:8766/health >/dev/null 2>&1; then
        atrium_health="healthy"
    fi
fi

hands_health="unhealthy"
if [ "$hands_status" = "running" ]; then
    if timeout 2 bash -c 'echo > /dev/tcp/localhost/8765' 2>/dev/null; then
        hands_health="healthy"
    fi
fi

# Disk usage
disk_usage=$($RUNTIME system df --format '{{.Size}}' 2>/dev/null | head -1 || echo "unknown")

# Volume check
volume_exists="false"
if $RUNTIME volume inspect parix-data >/dev/null 2>&1; then
    volume_exists="true"
fi

cat <<EOF
{
  "runtime": "$RUNTIME",
  "containers": {
    "atrium": {
      "status": "$atrium_status",
      "health": "$atrium_health"
    },
    "hands": {
      "status": "$hands_status",
      "health": "$hands_health"
    }
  },
  "volume_exists": $volume_exists,
  "disk_usage": "$disk_usage"
}
EOF
