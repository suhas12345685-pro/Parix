# OS Detection Matrix

| `sys.platform` | `detect_os()` | Notes |
|---|---|---|
| `win32` | `windows` | Includes 64-bit Windows |
| `darwin` | `macos` | All macOS versions |
| `linux` | `linux` | Standard Linux distros |
| `linux` + `/.dockerenv` | `docker` | Docker containers detected first |

## Architecture Normalization

| Raw `PROCESSOR_ARCHITECTURE` / `uname -m` | `detect_arch()` |
|---|---|
| `AMD64`, `x86_64`, `x64` | `x64` |
| `aarch64`, `arm64` | `arm64` |
| anything with `arm` | `arm64` |
| fallback | `x64` |

## Distro Detection (Linux only)

Reads `/etc/os-release` and parses the `ID=` field. Returns lowercase ID: `ubuntu`, `fedora`, `arch`, `debian`, etc. Returns `None` on non-Linux.
