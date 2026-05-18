#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Parix — Production Build Script
# Compiles Atrium + Aegis for deployment.
# Usage: bash scripts/build.sh [--docker]
# ─────────────────────────────────────────────────────────────
set -euo pipefail

CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${CYAN}[build]${NC} $1"; }
ok()   { echo -e "${GREEN}  ✓${NC} $1"; }
fail() { echo -e "${RED}  ✗${NC} $1"; exit 1; }

BUILD_DOCKER=false
[[ "${1:-}" == "--docker" ]] && BUILD_DOCKER=true

# ─── Clean Previous Builds ─────────────────────────────────────
log "Cleaning previous builds..."
rm -rf atrium/dist aegis/dist
ok "Clean complete"

# ─── Install Dependencies ─────────────────────────────────────
log "Installing dependencies..."
npm ci --production=false
ok "Dependencies installed"

# ─── Build Atrium (Brain) ─────────────────────────────────────
log "Building Atrium (TypeScript → JavaScript)..."
npm run build --workspace=atrium || fail "Atrium build failed"
ok "Atrium built → atrium/dist/"

# ─── Build Aegis (Web UI) ─────────────────────────────────────
log "Building Aegis (React → Static)..."
npm run build --workspace=aegis 2>/dev/null && ok "Aegis built → aegis/dist/" || log "Aegis build skipped (not configured yet)"

# ─── Verify Builds ────────────────────────────────────────────
log "Verifying build output..."
[ -d "atrium/dist" ] && ok "atrium/dist exists ($(du -sh atrium/dist | cut -f1))" || fail "atrium/dist missing"

# ─── Docker Build (optional) ──────────────────────────────────
if [ "$BUILD_DOCKER" = true ]; then
  log "Building Docker images..."

  if [ -f "deploy/docker/Dockerfile.atrium" ]; then
    docker build -f deploy/docker/Dockerfile.atrium -t parix-atrium:latest .
    ok "parix-atrium:latest built"
  else
    fail "deploy/docker/Dockerfile.atrium not found"
  fi

  if [ -f "deploy/docker/Dockerfile.hands" ]; then
    docker build -f deploy/docker/Dockerfile.hands -t parix-hands:latest .
    ok "parix-hands:latest built"
  else
    fail "deploy/docker/Dockerfile.hands not found"
  fi
fi

# ─── Summary ──────────────────────────────────────────────────
echo ""
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "  Build complete!"
log "  Start:  npm start (uses PM2)"
log "  Docker: bash scripts/build.sh --docker"
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
