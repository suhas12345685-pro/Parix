#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${PARIX_REPO_URL:-https://github.com/suhas12345685-pro/Parix.git}"
BRANCH="${PARIX_BRANCH:-main}"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/parix-install.XXXXXX")"

log() { printf '[parix] %s\n' "$1"; }
cleanup() { rm -rf "$WORK_DIR"; }
trap cleanup EXIT

log "Bootstrapping installer..."

OS_NAME="$(uname -s)"
ARCH="$(uname -m)"
IS_WSL=0
case "$OS_NAME" in
  Darwin) DETECTED_OS="macos" ;;
  Linux)
    if grep -qiE "(microsoft|wsl)" /proc/sys/kernel/osrelease 2>/dev/null \
       || grep -qiE "(microsoft|wsl)" /proc/version 2>/dev/null; then
      DETECTED_OS="wsl2"
      IS_WSL=1
    else
      DETECTED_OS="linux"
    fi
    ;;
  *) DETECTED_OS="unsupported" ;;
esac
log "Detected OS: $DETECTED_OS ($ARCH)"
if [ "$IS_WSL" -eq 1 ]; then
  log "WSL2 detected — installing the Linux build inside WSL."
  log "NOTE: screen-control (the operator / Windows UIAutomation) and native"
  log "      desktop notifications are Windows-native and do NOT work inside"
  log "      WSL2. The headless agent — sensors, messaging channels, CLI tasks,"
  log "      cron, and proactiveness — works here. For full on-screen operation,"
  log "      install natively on Windows with install.ps1 instead."
fi
log "This will clone Parix, install packages, build workspaces, and start Hatchery onboarding."

if ! command -v git >/dev/null 2>&1; then
  echo "Git is required for one-line installation. Install git, then rerun this command." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20+ is required. Install Node.js, then rerun this command." >&2
  exit 1
fi
NODE_MAJOR="$(node -v | sed 's/^v//' | cut -d. -f1)"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js 20+ is required (found $(node -v))." >&2
  exit 1
fi
log "Node.js $(node -v)"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required. Install Node.js 20+ with npm, then rerun this command." >&2
  exit 1
fi
log "npm $(npm -v)"

PYTHON_CMD=""
for cmd in python3 python; do
  if command -v "$cmd" >/dev/null 2>&1; then
    PYTHON_CMD="$cmd"
    break
  fi
done
if [ -z "$PYTHON_CMD" ]; then
  echo "Python 3.12+ is required. Install Python, then rerun this command." >&2
  exit 1
fi
PY_VERSION="$($PYTHON_CMD --version 2>&1)"
PY_MAJOR="$($PYTHON_CMD -c 'import sys; print(sys.version_info.major)')"
PY_MINOR="$($PYTHON_CMD -c 'import sys; print(sys.version_info.minor)')"
if [ "$PY_MAJOR" -lt 3 ] || { [ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -lt 12 ]; }; then
  echo "Python 3.12+ is required (found $PY_VERSION)." >&2
  exit 1
fi
log "$PY_VERSION"

log "Cloning $REPO_URL ($BRANCH)"
git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$WORK_DIR"

case "$OS_NAME" in
  Darwin)
    log "Running macOS installer"
    bash "$WORK_DIR/deploy/macos/install.sh"
    ;;
  Linux)
    log "Running Linux installer"
    bash "$WORK_DIR/deploy/linux/install.sh"
    ;;
  *)
    echo "Unsupported OS: $(uname -s)" >&2
    exit 1
    ;;
esac
