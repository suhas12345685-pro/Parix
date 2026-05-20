# Release Installer Pipeline

Parix now has an installer-artifact workflow at
`.github/workflows/installers.yml`. It is designed to run before signing
certificates exist, then automatically upgrades to signed/notarized artifacts
when the human-owned secrets are added.

## Artifacts

- `parix-windows-bootstrap`: Windows runtime payload plus installer scripts.
  Authenticode signing is attempted when `WINDOWS_CODESIGN_PFX_BASE64` and
  `WINDOWS_CODESIGN_PFX_PASSWORD` exist.
- `parix-macos-app`: a minimal `Parix.app` wrapper around the runtime payload.
  Signing uses `APPLE_CERTIFICATE_BASE64`, `APPLE_CERTIFICATE_PASSWORD`,
  `APPLE_KEYCHAIN_PASSWORD`, and `APPLE_SIGNING_IDENTITY`. Notarization uses
  `APPLE_ID`, `APPLE_TEAM_ID`, and `APPLE_APP_SPECIFIC_PASSWORD`.
- `parix-linux-deb`: first Linux packaging target, an `all` architecture
  `.deb` that installs the payload under `/usr/lib/parix` and exposes a
  `parix` launcher.

## Current Limits

The Windows job intentionally produces a bootstrap archive, not a polished MSI
or Squirrel installer yet. The signing hooks are in place, but the final
Windows installer format should be chosen once the Windows signing certificate
and update endpoint domain are available.

The macOS bundle is notarization-ready but needs a real Apple Developer account
before it can be verified. The Linux `.deb` can be smoke-tested immediately on a
Debian or Ubuntu machine.
