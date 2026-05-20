# Parix update feed — reference server

Minimal Node server that serves the contract Atrium's `UpdateChecker`
expects. ~120 lines, no framework, no DB. The manifest file is the
source of truth.

## Run locally

```bash
cd deploy/update-server
cp manifest.example.json manifest.json
node server.mjs
```

Default bind: `127.0.0.1:8788`. Try it:

```bash
curl 'http://127.0.0.1:8788/v1/check?platform=linux&channel=stable&version=0.1.0'
# → 200 with the manifest entry

curl 'http://127.0.0.1:8788/v1/check?platform=linux&channel=stable&version=0.1.7'
# → 204 (same version)
```

## Deploy behind Cloudflare

Recommended topology:

```
parix.dev DNS                           ┌─────────────┐
   ──updates.parix.dev──→ Cloudflare ──→│ This server │
                          (cache, TLS,  │ on a VM     │
                           rate-limit,  │ behind a   │
                           WAF)         │ private IP │
                                        └─────────────┘
```

Cloudflare rules:

- Cache `/v1/check` with **60s TTL**. The server already sets
  `Cache-Control: public, max-age=60`.
- Bypass cache for query strings? **No** — cache including query string,
  so each `(platform, channel, version)` is a distinct cache key. Newer
  versions hit the cache on the next 60s tick.
- Rate-limit: 60 req / IP / minute. Real clients poll every 6h.
- WAF: block any request whose `platform` isn't in
  `{windows, macos, linux}` or whose `version` doesn't match
  `^[\d.+-]{1,32}$`.

## Rollback

To pull a bad release, edit `manifest.json` and drop the version field
back to the previous good one. Cloudflare picks it up within 60s. No DB
migration, no redeploy.

If you need to make a rollback **immediate** (don't wait 60s), purge
the Cloudflare cache for `updates.parix.dev` via the dashboard or the
API.

## Channels

- **stable** — what `irm install.parix.ai/win.ps1` picks up.
- **beta** — opt-in via `profile.updates.channel = "beta"`.

We don't currently run a `nightly`. Add it by duplicating the schema:
the server reads any key in the manifest's root.

## Multi-region

Cloudflare's edge caches give you ~global coverage already. For real
HA, deploy two of these behind a load balancer; the manifest file goes
on shared storage (S3 with `aws s3 sync`, or a tiny git pull cron).

## What's not here

- **Signed manifests.** Until the code-signing certs land (Phase 2.1/2.2),
  we rely on Cloudflare's TLS + the SHA-256 check in the installer.
  When certs exist, add an Ed25519 signature over the manifest body.
- **Per-user staged rollouts.** Phase 4 work — add a `rollout` field
  (`{percent: 25, cohortHash: …}`) and have the server gate by hash of
  the requesting IP / installation UUID.
