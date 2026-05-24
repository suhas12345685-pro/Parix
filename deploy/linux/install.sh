#!/usr/bin/env bash
# ─── Parix — Linux/Ubuntu Installer ────────────────────────────
# Installs Parix as a systemd user service on Ubuntu 22.04+/Debian/Fedora.
# Usage: bash deploy/linux/install.sh
# Requires: Node.js 20+, Python 3.12+
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

PARIX_HOME="$HOME/.parix"
PARIX_BIN="$PARIX_HOME/bin"
PARIX_DATA="$PARIX_HOME/data"
PARIX_LOG="$PARIX_HOME/logs"
SRC_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SERVICE_NAME="parix-agent"
SERVICE_DIR="$HOME/.config/systemd/user"

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
STEP_COUNT=0
TOTAL_STEPS=9

log()  { 
    STEP_COUNT=$((STEP_COUNT + 1))
    echo -e "\n${CYAN}✦ [$STEP_COUNT/$TOTAL_STEPS]${NC} $1"
}
ok()   { echo -e "${GREEN}  ✔${NC} $1"; }
warn() { echo -e "${YELLOW}  ●${NC} $1"; }
fail() { echo -e "${RED}  ✘${NC} $1"; exit 1; }

# ─── Detect distro ────────────────────────────────────────────────
DISTRO="unknown"
if [ -f /etc/os-release ]; then
    . /etc/os-release
    DISTRO="$ID"
fi
log "Detected distro: $DISTRO"
ARCH="$(uname -m)"
ACTIVE_SKILLS_JSON='["skills/os-detect.md","skills/os-linux.md","skills/parix-install.md","skills/parix-hatchery.md"]'
if [ -f /.dockerenv ] || [ -f /run/.containerenv ]; then
    ACTIVE_SKILLS_JSON='["skills/os-detect.md","skills/os-docker.md","skills/parix-install.md","skills/parix-hatchery.md"]'
    DETECTED_OS="docker"
else
    DETECTED_OS="linux"
fi
log "Active OS skill: $([ "$DETECTED_OS" = "docker" ] && echo "skills/os-docker.md" || echo "skills/os-linux.md")"

# ─── Preflight ────────────────────────────────────────────────────
log "Running preflight checks..."

command -v node >/dev/null 2>&1 || fail "Node.js not found. Install v20+ from https://nodejs.org or: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs"
NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
[ "$NODE_VER" -ge 20 ] || fail "Node.js v20+ required (found v$(node -v))"
ok "Node.js $(node -v)"

command -v npm >/dev/null 2>&1 || fail "npm not found"
ok "npm $(npm -v)"

PYTHON_CMD=""
for cmd in python3 python; do
    if command -v "$cmd" >/dev/null 2>&1; then
        PYTHON_CMD="$cmd"
        break
    fi
done
[ -n "$PYTHON_CMD" ] || fail "Python 3.12+ not found. Install: sudo apt install python3 python3-pip"
PY_VER=$($PYTHON_CMD --version 2>&1)
PY_MAJOR=$($PYTHON_CMD -c 'import sys; print(sys.version_info.major)')
PY_MINOR=$($PYTHON_CMD -c 'import sys; print(sys.version_info.minor)')
[ "$PY_MAJOR" -gt 3 ] || { [ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -ge 12 ]; } || fail "Python 3.12+ required (found $PY_VER)"
ok "$PY_VER"

PIP_CMD=""
for cmd in pip3 pip; do
    command -v "$cmd" >/dev/null 2>&1 && PIP_CMD="$cmd" && break
done
[ -n "$PIP_CMD" ] || warn "pip not found — install: sudo apt install python3-pip"

# ─── Install system deps (optional, for accessibility) ────────────
log "Installing system dependencies for accessibility..."
if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get install -y --no-install-recommends \
        at-spi2-core \
        libatspi2.0-dev \
        python3-gi \
        gir1.2-atspi-2.0 \
        tesseract-ocr \
        scrot \
        2>/dev/null && ok "System deps installed (apt)" || warn "Some apt packages failed — accessibility may be limited"
elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y \
        at-spi2-core \
        at-spi2-atk \
        python3-gobject \
        tesseract \
        scrot \
        2>/dev/null && ok "System deps installed (dnf)" || warn "Some dnf packages failed"
elif command -v pacman >/dev/null 2>&1; then
    sudo pacman -S --noconfirm \
        at-spi2-core \
        python-gobject \
        tesseract \
        scrot \
        2>/dev/null && ok "System deps installed (pacman)" || warn "Some pacman packages failed"
else
    warn "Unknown package manager — install at-spi2-core, tesseract-ocr, scrot manually"
fi

# ─── Create directories ──────────────────────────────────────────
log "Creating Parix directories..."
mkdir -p "$PARIX_HOME" "$PARIX_BIN" "$PARIX_DATA" "$PARIX_LOG" "$SERVICE_DIR"
ok "Directories created"

# ─── Copy project files ──────────────────────────────────────────
log "Copying project files..."
for d in atrium hands shared hatchery aegis skills deploy; do
    if [ -d "$SRC_ROOT/$d" ]; then
        rsync -a --delete "$SRC_ROOT/$d/" "$PARIX_HOME/$d/"
        ok "Synced $d"
    else
        warn "Skipped $d"
    fi
done
cp "$SRC_ROOT/package.json" "$PARIX_HOME/"
[ -f "$SRC_ROOT/package-lock.json" ] && cp "$SRC_ROOT/package-lock.json" "$PARIX_HOME/"
[ -f "$SRC_ROOT/ecosystem.config.js" ] && cp "$SRC_ROOT/ecosystem.config.js" "$PARIX_HOME/"
[ -f "$SRC_ROOT/.env.example" ] && cp "$SRC_ROOT/.env.example" "$PARIX_HOME/"

# ─── Install Node dependencies ────────────────────────────────────
log "Installing or reusing Node.js dependencies..."
cd "$PARIX_HOME"
npm ci 2>/dev/null || npm install
ok "Node.js dependencies"

# ─── Install Python dependencies ──────────────────────────────────
log "Installing or reusing Python dependencies..."
if [ -f "$PARIX_HOME/hands/requirements.txt" ] && [ -n "$PIP_CMD" ]; then
    $PIP_CMD install -r "$PARIX_HOME/hands/requirements.txt" --quiet --break-system-packages 2>/dev/null || \
    $PIP_CMD install -r "$PARIX_HOME/hands/requirements.txt" --quiet
    ok "Python dependencies"
fi

# ─── Build Atrium ─────────────────────────────────────────────────
log "Building Parix workspaces..."
cd "$PARIX_HOME"
npm run build --workspace=atrium
npm run build --workspace=hatchery
npm run build --workspace=aegis
ok "Workspaces compiled"

# ─── Create launcher ──────────────────────────────────────────────
log "Creating launcher..."
cat > "$PARIX_BIN/parix" << 'LAUNCHER'
#!/usr/bin/env bash
set -euo pipefail
PARIX_HOME="${PARIX_HOME:-$HOME/.parix}"
ACTION="${1:-start}"
TARGET="${2:-all}"
export PARIX_HOME
export PARIX_DB_PATH="${PARIX_DB_PATH:-$PARIX_HOME/data/parix.db}"

case "$ACTION" in
    start)
        node "$PARIX_HOME/hatchery/dist/index.js" --runtime start "$TARGET"
        ;;
    stop)
        node "$PARIX_HOME/hatchery/dist/index.js" --runtime stop "$TARGET"
        ;;
    restart)
        node "$PARIX_HOME/hatchery/dist/index.js" --runtime restart "$TARGET"
        ;;
    status)
        node "$PARIX_HOME/hatchery/dist/index.js" --runtime status "$TARGET"
        ;;
    atrium)
        node "$PARIX_HOME/hatchery/dist/index.js" --runtime start all
        ;;
    onboarding)
        shift
        node "$PARIX_HOME/hatchery/dist/index.js" "$@"
        ;;
    *)
        echo "Usage: parix [start|stop|restart|status|onboarding] [all|hands|atrium|aegis]"
        ;;
esac
LAUNCHER
chmod +x "$PARIX_BIN/parix"
ok "Launcher at $PARIX_BIN/parix"

# ─── Install systemd user service ─────────────────────────────────
log "Installing systemd user service..."
NODE_PATH=$(command -v node)
PYTHON_PATH=$(command -v python3 || command -v python)

cat > "$SERVICE_DIR/$SERVICE_NAME.service" << SERVICE
[Unit]
Description=Parix Autonomous Agent
After=network-online.target graphical-session.target
Wants=network-online.target

[Service]
Type=forking
ExecStart=$PARIX_BIN/parix start
ExecStop=$PARIX_BIN/parix stop
WorkingDirectory=$PARIX_HOME
Environment=PARIX_HOME=$PARIX_HOME
Environment=PARIX_DB_PATH=$PARIX_DATA/parix.db
Environment=NODE_ENV=production
Environment=PATH=$PARIX_BIN:/usr/local/bin:/usr/bin:/bin
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
SERVICE

systemctl --user daemon-reload
systemctl --user enable "$SERVICE_NAME.service"
ok "systemd service installed and enabled"

# ─── Add to PATH ──────────────────────────────────────────────────
log "Adding to PATH..."
SHELL_RC="$HOME/.bashrc"
[ -n "${ZSH_VERSION:-}" ] && SHELL_RC="$HOME/.zshrc"
[ -f "$HOME/.zshrc" ] && SHELL_RC="$HOME/.zshrc"

if ! grep -q "PARIX_HOME" "$SHELL_RC" 2>/dev/null; then
    cat >> "$SHELL_RC" << PATHS

# Parix agent
export PARIX_HOME="$PARIX_HOME"
export PATH="\$PARIX_HOME/bin:\$PATH"
PATHS
    ok "Added to $SHELL_RC"
else
    ok "Already in shell config"
fi

# ─── .env file ────────────────────────────────────────────────────
if [ ! -f "$PARIX_HOME/.env" ]; then
    if [ -f "$SRC_ROOT/.env.example" ]; then
        cp "$SRC_ROOT/.env.example" "$PARIX_HOME/.env"
    else
        cat > "$PARIX_HOME/.env" << 'ENV'
# Parix Environment Configuration
# GEMINI_API_KEY=
# TELEGRAM_BOT_TOKEN=
# TELEGRAM_CHAT_ID=
ENV
    fi
    ok "Created .env"
    warn "Edit $PARIX_HOME/.env with your API keys"
fi

# Installer context: tells Hatchery/Atrium which OS skill pack is active.
cat > "$PARIX_HOME/install-context.json" << CONTEXT
{
  "os": "$DETECTED_OS",
  "distro": "$DISTRO",
  "arch": "$ARCH",
  "nodeVersion": "$(node -v)",
  "pythonVersion": "$PY_VER",
  "activeSkills": $ACTIVE_SKILLS_JSON,
  "detectedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
CONTEXT
ok "Wrote install context with OS skill routing"

# ─── DBUS for AT-SPI2 ────────────────────────────────────────────
log "Checking D-Bus accessibility bridge..."
if gsettings get org.gnome.desktop.interface toolkit-accessibility 2>/dev/null | grep -q "true"; then
    ok "AT-SPI2 accessibility bridge is enabled"
else
    warn "Enable accessibility: gsettings set org.gnome.desktop.interface toolkit-accessibility true"
fi

# ─── Run onboarding ────────────────────────────────────────────────
log "Starting Hatchery onboarding or runtime..."
export PARIX_HOME
export PARIX_DB_PATH="$PARIX_DATA/parix.db"
export PARIX_WORKSPACE="$PARIX_HOME"
node "$PARIX_HOME/hatchery/dist/index.js" --post-install || \
    warn "Onboarding skipped — run 'parix onboarding' later to configure."

# ─── Summary ──────────────────────────────────────────────────────
echo -e "\n${GREEN}=========================================================${NC}"
echo -e "${GREEN}    PARIX INSTALLED SUCCESSFULLY & RUNNING SILENTLY      ${NC}"
echo -e "${GREEN}=========================================================${NC}"
log "  Home:    $PARIX_HOME"
log "  Data:    $PARIX_DATA"
log "  Logs:    $PARIX_LOG"
log "  Distro:  $DISTRO"
log ""
log "  Commands:"
log "    parix start          - spawn all processes"
log "    parix stop           - kill processes & PIDs"
log "    parix status         - check active processes"
log "    parix onboarding     - reconfigure preferences"
log "    systemctl --user start $SERVICE_NAME"
echo ""
