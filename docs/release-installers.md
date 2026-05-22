# Release Pipeline

Parix has one canonical tag-driven release workflow:
`.github/workflows/release.yml`.

Push a tag such as `v0.2.0-alpha` to run the full pipeline:

1. Validate Node and Python tests.
2. Build and push the Atrium and Hands Docker images to GHCR.
3. Build Windows, macOS, and Linux distributables.
4. Upload `SHA256SUMS.txt`.
5. Publish the GitHub Release, marking prerelease tags as prereleases.

## Release Assets

For `v0.2.0-alpha`, the workflow publishes:

- `parix-v0.2.0-alpha-windows-x64.zip`
- `parix-v0.2.0-alpha-macos.tar.gz`
- `parix-v0.2.0-alpha-linux-x64.tar.gz`
- `parix-v0.2.0-alpha-linux-x64.AppImage`
- `SHA256SUMS.txt`

The update feed should point Windows at the zip, macOS at the tarball, and
Linux at the AppImage unless a platform-specific installer replaces it later.

## Signing Hooks

The release workflow signs when these human-owned secrets exist:

- Windows Authenticode: `WINDOWS_SIGNING_CERT_BASE64`,
  `WINDOWS_SIGNING_PASSWORD`
- macOS signing: `APPLE_CERTIFICATE_BASE64`,
  `APPLE_CERTIFICATE_PASSWORD`, optional `APPLE_SIGNING_IDENTITY`
- macOS notarization: `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_APP_PASSWORD`

Missing signing secrets do not block alpha releases; the workflow emits a
warning and publishes unsigned artifacts.

## Current Limits

The Windows artifact is a zip distributable, not an MSI or Squirrel installer.
The Linux `.deb` experiment from the retired installer workflow is not part of
the v0.2.0-alpha release path. Reintroduce package-manager formats only after
the update feed and code-signing path are stable.
