#!/usr/bin/env bash
# ─── Parix — AppImage builder ────────────────────────────────────────
# Builds a self-contained AppImage from a staged distribution. Assumes
# `npm run build --workspace=...` has already produced dist/ trees, and
# `dist-staging/parix/` contains the runtime files.
#
# Usage:
#   bash deploy/linux/build-appimage.sh v0.2.0-alpha
#
# Output: parix-v0.2.0-alpha-linux-x64.AppImage in $PWD.
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

TAG="${1:-dev}"
RAW_ARCH="$(uname -m)"
case "$RAW_ARCH" in
    x86_64|amd64) ASSET_ARCH="x64" ;;
    aarch64|arm64) ASSET_ARCH="arm64" ;;
    *) ASSET_ARCH="$RAW_ARCH" ;;
esac
APPDIR="parix.AppDir"
SRC_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STAGE="$SRC_ROOT/dist-staging/parix"

log() { printf '[appimage] %s\n' "$1"; }
fail() { printf '[appimage] ERROR: %s\n' "$1" >&2; exit 1; }

# ─── Preflight ───────────────────────────────────────────────────────
[ -d "$STAGE" ] || fail "Expected staged tree at $STAGE — run the release workflow's 'Stage distributable' step first."

# Fetch appimagetool if not on PATH.
if ! command -v appimagetool >/dev/null 2>&1; then
    log "Downloading appimagetool..."
    curl -fsSL -o /tmp/appimagetool \
        "https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-${RAW_ARCH}.AppImage"
    chmod +x /tmp/appimagetool
    APPIMAGETOOL=/tmp/appimagetool
else
    APPIMAGETOOL="$(command -v appimagetool)"
fi

# ─── Compose AppDir ──────────────────────────────────────────────────
log "Composing $APPDIR..."
rm -rf "$APPDIR"
mkdir -p "$APPDIR/usr/bin" "$APPDIR/usr/share/parix" "$APPDIR/usr/share/applications" "$APPDIR/usr/share/icons/hicolor/256x256/apps"

# Copy the staged tree into /usr/share/parix.
cp -R "$STAGE"/. "$APPDIR/usr/share/parix/"

# ─── AppRun ──────────────────────────────────────────────────────────
cat > "$APPDIR/AppRun" <<'APPRUN'
#!/usr/bin/env bash
# Parix AppImage entry point.
set -e
HERE="$(dirname "$(readlink -f "$0")")"
export PARIX_HOME="${PARIX_HOME:-$HOME/.parix}"
export PATH="$HERE/usr/bin:$PATH"

# First-run install: lay down ~/.parix on first launch.
if [ ! -d "$PARIX_HOME" ]; then
    echo "[parix] First run — copying runtime to $PARIX_HOME"
    mkdir -p "$PARIX_HOME"
    cp -R "$HERE/usr/share/parix"/. "$PARIX_HOME/"
fi

cd "$PARIX_HOME"
# Default to onboarding if no profile yet, else start the runtime.
if [ -f "$PARIX_HOME/profile.json" ]; then
    exec npx pm2 start ecosystem.config.js --no-daemon
else
    exec node hatchery/dist/index.js "$@"
fi
APPRUN
chmod +x "$APPDIR/AppRun"

# ─── .desktop file ───────────────────────────────────────────────────
cat > "$APPDIR/parix.desktop" <<'DESKTOP'
[Desktop Entry]
Type=Application
Name=Parix
Comment=Local-first autonomous agent
Exec=AppRun %F
Icon=parix
Categories=Utility;Productivity;
Terminal=true
StartupWMClass=parix
DESKTOP
cp "$APPDIR/parix.desktop" "$APPDIR/usr/share/applications/"

# ─── Icon ────────────────────────────────────────────────────────────
ICON_SRC="$SRC_ROOT/aegis/public/parix-icon.png"
if [ -f "$ICON_SRC" ]; then
    cp "$ICON_SRC" "$APPDIR/parix.png"
    cp "$ICON_SRC" "$APPDIR/usr/share/icons/hicolor/256x256/apps/parix.png"
else
    log "Warning: no icon found at $ICON_SRC — embedding a 1x1 placeholder"
    # 1x1 transparent PNG — minimal but valid.
    printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82' > "$APPDIR/parix.png"
fi

# ─── Bake ────────────────────────────────────────────────────────────
OUT="parix-${TAG}-linux-${ASSET_ARCH}.AppImage"
log "Building $OUT..."
ARCH="$RAW_ARCH" "$APPIMAGETOOL" "$APPDIR" "$OUT"
log "Done: $(realpath "$OUT")"
