#!/usr/bin/env bash
# ─── Parix — macOS Installer ───────────────────────────────────
# Installs Parix as a launchd agent on macOS 13+ (Ventura+).
# Usage: bash deploy/macos/install.sh
# Requires: Node.js 20+, Python 3.12+, Xcode CLT (for pyobjc)
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

PARIX_HOME="$HOME/.parix"
PARIX_BIN="$PARIX_HOME/bin"
PARIX_DATA="$PARIX_HOME/data"
PARIX_LOG="$PARIX_HOME/logs"
SRC_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PLIST_NAME="com.parix.agent"
PLIST_SRC="$(dirname "$0")/$PLIST_NAME.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${CYAN}[parix]${NC} $1"; }
ok()   { echo -e "${GREEN}  +${NC} $1"; }
warn() { echo -e "${YELLOW}  !${NC} $1"; }
fail() { echo -e "${RED}  x${NC} $1"; exit 1; }

# ─── Preflight ────────────────────────────────────────────────────
log "Running preflight checks..."

DETECTED_OS="macos"
ARCH="$(uname -m)"
ACTIVE_SKILLS_JSON='["skills/os-detect.md","skills/os-macos.md","skills/parix-install.md","skills/parix-hatchery.md"]'
ok "OS $DETECTED_OS ($ARCH)"
ok "Active OS skill: skills/os-macos.md"

command -v node >/dev/null 2>&1 || fail "Node.js not found. Install: brew install node"
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
[ -n "$PYTHON_CMD" ] || fail "Python 3.12+ not found. Install: brew install python@3.12"
PY_VER=$($PYTHON_CMD --version 2>&1)
PY_MAJOR=$($PYTHON_CMD -c 'import sys; print(sys.version_info.major)')
PY_MINOR=$($PYTHON_CMD -c 'import sys; print(sys.version_info.minor)')
[ "$PY_MAJOR" -gt 3 ] || { [ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -ge 12 ]; } || fail "Python 3.12+ required (found $PY_VER)"
ok "$PY_VER"

# Check for Accessibility permissions hint
if ! command -v xcode-select >/dev/null 2>&1; then
    warn "Xcode CLT not detected. Run: xcode-select --install"
fi

# ─── Create directories ──────────────────────────────────────────
log "Creating Parix directories..."
mkdir -p "$PARIX_HOME" "$PARIX_BIN" "$PARIX_DATA" "$PARIX_LOG"
ok "Directories created at $PARIX_HOME"

# ─── Copy project files ──────────────────────────────────────────
log "Copying project files..."
for d in atrium hands shared hatchery aegis skills deploy; do
    if [ -d "$SRC_ROOT/$d" ]; then
        rsync -a --delete "$SRC_ROOT/$d/" "$PARIX_HOME/$d/"
        ok "Synced $d"
    else
        warn "Skipped $d (not found)"
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
ok "Node.js dependencies installed"

# ─── Install Python dependencies ──────────────────────────────────
log "Installing or reusing Python dependencies..."
if [ -f "$PARIX_HOME/hands/requirements.txt" ]; then
    $PYTHON_CMD -m pip install -r "$PARIX_HOME/hands/requirements.txt" --quiet
    ok "Python dependencies installed"
    # macOS-specific: pyobjc for Accessibility API
    $PYTHON_CMD -m pip install pyobjc-core pyobjc-framework-Cocoa pyobjc-framework-ApplicationServices --quiet 2>/dev/null || \
        warn "pyobjc install failed — accessibility features will use vision fallback"
else
    warn "requirements.txt not found"
fi

# ─── Build Atrium ─────────────────────────────────────────────────
log "Building Parix workspaces..."
cd "$PARIX_HOME"
npm run build --workspace=atrium
npm run build --workspace=hatchery
npm run build --workspace=aegis
ok "Workspaces compiled"

# ─── Create launcher script ──────────────────────────────────────
log "Creating launcher script..."
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

# ─── Install launchd plist ────────────────────────────────────────
log "Installing launchd agent (auto-start on login)..."
# Unload existing if present
launchctl bootout "gui/$(id -u)/$PLIST_NAME" 2>/dev/null || true

# Generate plist with resolved paths
NODE_PATH=$(command -v node)
PYTHON_PATH=$(command -v python3 || command -v python)
cat > "$PLIST_DEST" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$PLIST_NAME</string>
    <key>ProgramArguments</key>
    <array>
        <string>$PARIX_BIN/parix</string>
        <string>start</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>
    <key>WorkingDirectory</key>
    <string>$PARIX_HOME</string>
    <key>StandardOutPath</key>
    <string>$PARIX_LOG/parix.log</string>
    <key>StandardErrorPath</key>
    <string>$PARIX_LOG/parix.err</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PARIX_HOME</key>
        <string>$PARIX_HOME</string>
        <key>PARIX_DB_PATH</key>
        <string>$PARIX_DATA/parix.db</string>
        <key>PATH</key>
        <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    </dict>
    <key>ThrottleInterval</key>
    <integer>10</integer>
</dict>
</plist>
PLIST

launchctl bootstrap "gui/$(id -u)" "$PLIST_DEST" 2>/dev/null || \
    launchctl load "$PLIST_DEST" 2>/dev/null || \
    warn "Could not load launchd agent — load manually: launchctl load $PLIST_DEST"
ok "launchd agent installed"

# ─── Add to PATH ──────────────────────────────────────────────────
log "Adding to PATH..."
SHELL_RC="$HOME/.zshrc"
[ -f "$HOME/.bashrc" ] && ! [ -f "$HOME/.zshrc" ] && SHELL_RC="$HOME/.bashrc"
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
        ok "Created .env from example"
    else
        cat > "$PARIX_HOME/.env" << 'ENV'
# Parix Environment Configuration
# GEMINI_API_KEY=
# TELEGRAM_BOT_TOKEN=
# TELEGRAM_CHAT_ID=
ENV
        ok "Created blank .env"
    fi
    warn "Edit $PARIX_HOME/.env with your API keys"
fi

# Installer context: tells Hatchery/Atrium which OS skill pack is active.
cat > "$PARIX_HOME/install-context.json" << CONTEXT
{
  "os": "$DETECTED_OS",
  "distro": null,
  "arch": "$ARCH",
  "nodeVersion": "$(node -v)",
  "pythonVersion": "$PY_VER",
  "activeSkills": $ACTIVE_SKILLS_JSON,
  "detectedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
CONTEXT
ok "Wrote install context with OS skill routing"

# ─── Accessibility permissions ────────────────────────────────────
log "NOTE: macOS requires Accessibility permissions for Parix."
log "  System Settings > Privacy & Security > Accessibility"
log "  Add Terminal.app (or your terminal) to the allowed list."

# ─── Run onboarding ────────────────────────────────────────────────
log "Starting Hatchery onboarding or runtime..."
export PARIX_HOME
export PARIX_DB_PATH="$PARIX_DATA/parix.db"
export PARIX_WORKSPACE="$PARIX_HOME"
node "$PARIX_HOME/hatchery/dist/index.js" --post-install || \
    warn "Onboarding skipped — run 'parix onboarding' later to configure."

# ─── Summary ──────────────────────────────────────────────────────
echo ""
log "Installation complete!"
log "  Home:    $PARIX_HOME"
log "  Data:    $PARIX_DATA"
log "  Logs:    $PARIX_LOG"
log "  Command: parix [start|stop|restart|status|onboarding] [all|hands|atrium|aegis]"
log ""
log "  Commands:"
log "    parix start          (manual start)"
log "    parix stop           (manual stop)"
log "    parix restart        (restart)"
log "    parix status         (check status)"
log "    parix start atrium   (start only Atrium)"
log "    parix onboarding     (reconfigure)"
log ""
log "  Notes:"
log "    1. source $SHELL_RC  (or open new terminal)"
log "    2. Grant Accessibility permissions in System Settings"
