# Parix marketplace API

Read-mostly registry of third-party skills. Powers the skill listing in
Aegis, the `parix skills install` CLI (TODO), and download counts.

## Quickstart (dev, SQLite)

```bash
cd marketplace
npm install
npm run migrate
npm run dev
```

Server listens on `:8787`. Sample requests:

```bash
# Public
curl http://localhost:8787/healthz
curl http://localhost:8787/v1/skills
curl http://localhost:8787/v1/skills/task-disk-cleanup

# Admin (need MARKETPLACE_ADMIN_TOKEN env var set)
MARKETPLACE_ADMIN_TOKEN=dev curl -X POST http://localhost:8787/v1/admin/skills \
  -H 'authorization: Bearer dev' -H 'content-type: application/json' \
  -d '{
    "id":"my-skill","name":"My skill","description":"…",
    "authorId":"alice","repoUrl":"https://github.com/alice/my-skill",
    "license":"MIT","reversibility":0.9,"permissions":["filesystem:read"],
    "initialVersion":"1.0.0","tagRef":"v1.0.0",
    "sha256":"0000000000000000000000000000000000000000000000000000000000000000"
  }'
```

## Production (Postgres)

Set `DATABASE_URL` to a Postgres connection string. `npm run migrate`
applies all `.sql` files from `migrations/` in lexical order.

```bash
DATABASE_URL=postgres://… MARKETPLACE_ADMIN_TOKEN=… npm start
```

Deploy behind Cloudflare. The handful of POST endpoints are admin-only
and rate-limited at the edge; GETs are CDN-cacheable (`Cache-Control:
public, max-age=60`).

## Endpoints

See the top of `src/server.ts` for the full list and contract.

## What's not here yet

- **GitHub OAuth** instead of the static admin token. Phase 4.
- **Author-side submission UI** — for now it's `curl` against the admin
  endpoint. Suhas does submissions manually until OAuth lands.
- **Per-IP rate limits**. Handle at the edge (Cloudflare WAF rules).
- **Pagination** on `/v1/skills`. The list is small enough that `limit`
  is sufficient until ~1k skills.
