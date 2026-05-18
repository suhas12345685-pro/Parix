---
name: parix-platform-capabilities
description: Detect and implement Parix OS capability behavior across Windows, macOS, Linux, and Docker. Use when editing `hands/platform.py`, OS-specific probes, package manager detection, clipboard/screenshot/notification/accessibility availability, or platform-gated Hands behavior.
---

# Parix Platform Capabilities

## Workflow

1. Read `shared/protocol.json`, `hands/protocol.py`, and `hands/platform.py` before editing.
2. Identify whether the task targets native desktop mode or Docker headless mode.
3. Keep probes side-effect free: check binaries, modules, environment, or known marker files only.
4. Return booleans for capability probes. Do not raise on missing optional dependencies.
5. Keep OS names exactly: `windows`, `macos`, `linux`, `docker`.
6. Run Python syntax/import checks after changes.

## Probe Rules

- `accessibility`: Windows uses `pywinauto`; macOS uses `ApplicationServices`; Linux uses `pyatspi` or `gi`.
- `screenshot`: prefer `mss`; fallback to native binaries such as `screencapture`, `grim`, `scrot`, or `gnome-screenshot`.
- `clipboard`: prefer `pyperclip`; fallback to `pbpaste`, `wl-paste`, `xclip`, `xsel`, or PowerShell `Get-Clipboard`.
- `notifications`: native desktop tools only in native mode; webhooks or chat channels in Docker mode.
- `package_manager`: detect the platform’s installed manager, never assume one exists.

## References

Use repo OS references only when platform details matter:

- `skills/os-windows.md`
- `skills/os-macos.md`
- `skills/os-linux.md`
- `skills/os-docker.md`
