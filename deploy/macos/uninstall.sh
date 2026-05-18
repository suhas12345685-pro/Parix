#!/usr/bin/env bash
# ─── Parix — macOS Uninstaller ──────────────────────────────────
# Removes Parix installation, launchd agent, and shell config.
# Usage: bash deploy/macos/uninstall.sh
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

PARIX_HOME="$HOME/.parix"
PLIST_NAME="com.parix.agent"
PLIST_DEST="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"

CYAN='\033[0;36m'; GREEN='\033[0;32m'; NC='\033[0m'
log() { echo -e "${CYAN}[parix]${NC} $1"; }
ok()  { echo -e "${GREEN}  +${NC} $1"; }

# ─── Stop processes ───────────────────────────────────────────────
log "Stopping Parix..."
"$PARIX_HOME/bin/parix" stop 2>/dev/null || true

# ─── Unload launchd agent ─────────────────────────────────────────
log "Removing launchd agent..."
launchctl bootout "gui/$(id -u)/$PLIST_NAME" 2>/dev/null || \
    launchctl unload "$PLIST_DEST" 2>/dev/null || true
rm -f "$PLIST_DEST"
ok "launchd agent removed"

# ─── Clean shell config ──────────────────────────────────────────
log "Cleaning shell config..."
for rc in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.bash_profile"; do
    if [ -f "$rc" ]; then
        sed -i.bak '/# Parix agent/d;/PARIX_HOME/d' "$rc"
        rm -f "${rc}.bak"
    fi
done
ok "Shell config cleaned"

# ─── Remove files ─────────────────────────────────────────────────
log "Removing installation..."
if [ -d "$PARIX_HOME" ]; then
    rm -rf "$PARIX_HOME"
    ok "Removed $PARIX_HOME"
else
    ok "Already clean"
fi

echo ""
log "Parix has been uninstalled."
