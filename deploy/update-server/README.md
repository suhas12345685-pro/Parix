# Parix Update Feed Reference Server

Minimal Node server that serves the contract Atrium's `UpdateChecker`
expects. The manifest file is the source of truth; there is no database.

## Run Locally

```bash
cd deploy/update-server
cp manifest.example.json manifest.json
node server.mjs
```

Default bind: `127.0.0.1:8788`. Try it:

```bash
curl 'http://127.0.0.1:8788/v1/check?platform=linux&channel=beta&version=0.0.0'
# -> 200 with the v0.2.0-alpha beta manifest entry

curl 'http://127.0.0.1:8788/v1/check?platform=linux&channel=beta&version=0.2.0-alpha'
# -> 204 because the caller is already on the latest beta
```

## Release Feed Update

The canonical release workflow is `.github/workflows/release.yml`.
For tag `v0.2.0-alpha` it publishes these update-feed asset names:

- `parix-v0.2.0-alpha-windows-x64.zip`
- `parix-v0.2.0-alpha-macos.tar.gz`
- `parix-v0.2.0-alpha-linux-x64.AppImage`

After the GitHub Release is published, copy the real SHA-256 values from
the release's `SHA256SUMS.txt` asset into `manifest.json` before promoting
the feed. Keep alpha and prerelease builds on the `beta` channel; reserve
`stable` for production-ready releases.

## Deploy Behind Cloudflare

Recommended topology:

```text
updates.parix.dev -> Cloudflare cache/TLS/WAF -> this server on a VM
```

Cloudflare rules:

- Cache `/v1/check` with a 60 second TTL. The server already sets
  `Cache-Control: public, max-age=60`.
- Keep query strings in the cache key so each
  `(platform, channel, version)` tuple is cached independently.
- Rate-limit to 60 requests per IP per minute. Real clients poll every
  six hours.
- Block requests whose `platform` is not one of
  `{windows, macos, linux}` or whose `version` does not match
  `^[0-9A-Za-z.+-]{1,32}$`.

## Rollback

To pull a bad release, edit `manifest.json` and drop the affected
platform entry back to the previous good version. Cloudflare picks it up
within 60 seconds. No database migration or redeploy is required.

For an immediate rollback, purge the Cloudflare cache for
`updates.parix.dev` through the dashboard or API.

## Channels

- `stable`: production-ready releases.
- `beta`: alpha, beta, and release-candidate builds.

The server currently allows only `stable` and `beta`. Add another channel
by extending the allow-list in `server.mjs` and adding a matching manifest
root key.

## What's Not Here

- Signed manifests. Until code-signing certs land, we rely on Cloudflare
  TLS plus the SHA-256 check in the installer. When certs exist, add an
  Ed25519 signature over the manifest body.
- Per-user staged rollouts. Add a `rollout` field such as
  `{ "percent": 25, "cohortHash": "..." }` and have the server gate by a
  hash of the requesting installation UUID.
