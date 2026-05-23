# Aegis Desktop Shell (Electron)

The Aegis dashboard ships in two forms:

1. **Browser** — `npm run dev` serves it on `http://localhost:3000`. Useful for
   headless dev.
2. **Desktop app** — Electron wraps the built bundle into a single-window
   tray app. This is the form end users install.

## Dev

```bash
npm install --workspace=aegis
# In one shell: run the Vite dev server
npm run dev --workspace=aegis
# In another shell: launch Electron pointing at the dev server (HMR works)
npm run electron:dev --workspace=aegis
```

## Building the installer

The PowerShell installer at `deploy/windows/install.ps1` calls
`npm run electron:package --workspace=aegis` to produce a Windows NSIS
installer in `aegis/release/`. The installer adds a Start menu shortcut
named "Parix" — that's the searchable entry the user sees when they hit Win
and start typing.

```bash
# All platforms
npm run electron:package --workspace=aegis           # Windows NSIS
npm run electron:package:mac --workspace=aegis       # macOS DMG
npm run electron:package:linux --workspace=aegis     # Linux AppImage
```

## Icons

Drop platform-specific icons here:

- `electron/icons/parix.ico` — Windows
- `electron/icons/parix.icns` — macOS
- `electron/icons/parix.png` — Linux (also fallback for tray)

If an icon is missing, the shell uses an empty image and the tray entry will
be invisible until you ship real assets — the app still runs.

## What it does

- Loads `../dist/index.html` in production. Falls back to
  `$AEGIS_DEV_URL` (default `http://localhost:3000`) when the dist is missing.
- Single-instance lock: launching `parix` twice focuses the existing window
  instead of opening a second one.
- Close button hides to tray. Quit-from-tray is the only way to actually
  exit (Parix is a long-lived companion process).
- External links open in the user's default browser, never inside the
  Electron window.

## What it does NOT do

- No Node integration in the renderer (`contextIsolation: true`, sandboxed).
  The UI talks to Atrium via the existing WebSocket relay on `:8766`, not
  via IPC. Keeps the threat surface tiny.
- No auto-update — would be the next step before public release.
