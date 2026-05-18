#!/usr/bin/env bash
# ─── Parix — Linux Uninstaller ──────────────────────────────────
# Removes Parix installation, systemd service, and shell config.
# Usage: bash deploy/linux/uninstall.sh
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

PARIX_HOME="$HOME/.parix"
SERVICE_NAME="parix-agent"

CYAN='\033[0;36m'; GREEN='\033[0;32m'; NC='\033[0m'
log() { echo -e "${CYAN}[parix]${NC} $1"; }
ok()  { echo -e "${GREEN}  +${NC} $1"; }

# ─── Stop and disable service ─────────────────────────────────────
log "Stopping Parix..."
systemctl --user stop "$SERVICE_NAME.service" 2>/dev/null || true
systemctl --user disable "$SERVICE_NAME.service" 2>/dev/null || true
rm -f "$HOME/.config/systemd/user/$SERVICE_NAME.service"
systemctl --user daemon-reload 2>/dev/null || true
ok "systemd service removed"

# ─── Stop any remaining processes ─────────────────────────────────
"$PARIX_HOME/bin/parix" stop 2>/dev/null || true

# ─── Clean shell config ──────────────────────────────────────────
log "Cleaning shell config..."
for rc in "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.bash_profile"; do
    if [ -f "$rc" ]; then
        sed -i '/# Parix agent/d;/PARIX_HOME/d' "$rc"
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
