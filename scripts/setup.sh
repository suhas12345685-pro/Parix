#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Parix — Local Environment Setup
# One-command install for development machines.
# Usage: bash scripts/setup.sh
# ─────────────────────────────────────────────────────────────
set -euo pipefail

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()   { echo -e "${CYAN}[parix]${NC} $1"; }
ok()    { echo -e "${GREEN}  ✓${NC} $1"; }
warn()  { echo -e "${YELLOW}  ⚠${NC} $1"; }
fail()  { echo -e "${RED}  ✗${NC} $1"; exit 1; }

# ─── Preflight Checks ─────────────────────────────────────────
log "Running preflight checks..."

command -v node >/dev/null 2>&1 || fail "Node.js not found. Install v20+ from https://nodejs.org"
NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
[ "$NODE_VER" -ge 20 ] || fail "Node.js v20+ required (found v$NODE_VER)"
ok "Node.js $(node -v)"

command -v npm >/dev/null 2>&1 || fail "npm not found"
ok "npm $(npm -v)"

command -v python3 >/dev/null 2>&1 || command -v python >/dev/null 2>&1 || fail "Python 3.12+ not found"
PYTHON_CMD=$(command -v python3 || command -v python)
PY_VER=$($PYTHON_CMD --version 2>&1 | awk '{print $2}' | cut -d. -f1-2)
ok "Python $PY_VER"

command -v pip3 >/dev/null 2>&1 || command -v pip >/dev/null 2>&1 || warn "pip not found — Python deps will need manual install"
PIP_CMD=$(command -v pip3 || command -v pip || echo "pip")

# ─── Node.js Dependencies ─────────────────────────────────────
log "Installing Node.js dependencies (all workspaces)..."
npm ci 2>/dev/null || npm install
ok "Node.js dependencies installed"

# ─── Python Dependencies ──────────────────────────────────────
log "Installing Python dependencies for Hands..."
if [ -f "hands/requirements.txt" ]; then
  $PIP_CMD install -r hands/requirements.txt --quiet
  ok "Python runtime dependencies installed"
else
  warn "hands/requirements.txt not found — skipping"
fi

if [ -f "hands/requirements-dev.txt" ]; then
  $PIP_CMD install -r hands/requirements-dev.txt --quiet
  ok "Python dev dependencies installed"
else
  warn "hands/requirements-dev.txt not found — skipping dev deps"
fi

# ─── Environment File ─────────────────────────────────────────
log "Setting up environment..."
if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    cp .env.example .env
    ok "Created .env from .env.example"
    warn "Edit .env with your API keys before running"
  else
    warn "No .env.example found — create .env manually"
  fi
else
  ok ".env already exists"
fi

# ─── SQLite Database ──────────────────────────────────────────
log "Initializing SQLite database..."
if [ -f "shared/schema.sql" ]; then
  mkdir -p data
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 data/parix.db < shared/schema.sql 2>/dev/null || true
    ok "SQLite database initialized at data/parix.db"
  else
    warn "sqlite3 CLI not found — database will be created on first run"
  fi
else
  warn "shared/schema.sql not found — database schema pending"
fi

# ─── TypeScript Build ─────────────────────────────────────────
log "Building TypeScript (Atrium)..."
npm run build --workspace=atrium 2>/dev/null && ok "Atrium built" || warn "Atrium build failed — may need source files first"

# ─── Summary ──────────────────────────────────────────────────
echo ""
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "  Setup complete! Next steps:"
log "  1. Edit .env with your API keys"
log "  2. Run: npm run hatch  (guided setup)"
log "  3. Run: npm run dev    (start Atrium)"
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
