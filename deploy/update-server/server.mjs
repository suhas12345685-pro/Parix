#!/usr/bin/env node
/**
 * Parix update feed reference server.
 *
 * Serves the contract documented at the top of
 * atrium/src/updates/checker.ts:
 *
 *   GET /v1/check?platform=<windows|macos|linux>&channel=<stable|beta>&version=<semver>
 *     200 -> newest release manifest if newer
 *     204 -> caller is already on the latest for this channel
 *     500 -> internal error (manifest missing, malformed, etc.)
 *
 * The manifest lives at $UPDATE_MANIFEST_PATH (default ./manifest.json).
 * Keep prereleases such as 0.2.0-alpha on the beta channel and reserve
 * stable for production-ready releases.
 *
 * Rollback = edit the manifest and drop the version field back. There is
 * no database; the file is the source of truth. Cache via Cloudflare with
 * a short TTL (60s) so rollbacks propagate fast.
 *
 * Bind to localhost by default; put Cloudflare in front for TLS + cache.
 */
import { createServer } from "node:http";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const PORT = Number(process.env.PORT || 8788);
const HOST = process.env.HOST || "127.0.0.1";
const MANIFEST_PATH = resolve(
  process.env.UPDATE_MANIFEST_PATH || "./manifest.json",
);
const PLATFORMS = new Set(["windows", "macos", "linux"]);
const CHANNELS = new Set(["stable", "beta"]);

let manifestCache = { mtime: 0, data: null };

function loadManifest() {
  const st = statSync(MANIFEST_PATH);
  if (st.mtimeMs === manifestCache.mtime && manifestCache.data) {
    return manifestCache.data;
  }
  const raw = readFileSync(MANIFEST_PATH, "utf-8");
  const parsed = JSON.parse(raw);
  manifestCache = { mtime: st.mtimeMs, data: parsed };
  return parsed;
}

function parseSemver(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.+)?$/.exec(
    String(v).trim(),
  );
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    pre: m[4] ?? null,
  };
}

function isNewer(candidate, current) {
  const a = parseSemver(candidate);
  const b = parseSemver(current);
  if (!a || !b) return candidate !== current;
  if (a.major !== b.major) return a.major > b.major;
  if (a.minor !== b.minor) return a.minor > b.minor;
  if (a.patch !== b.patch) return a.patch > b.patch;
  if (!a.pre && b.pre) return true;
  if (a.pre && !b.pre) return false;
  return false;
}

function reply(res, status, body, headers = {}) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "public, max-age=60",
    ...headers,
  });
  if (body !== null) res.end(JSON.stringify(body));
  else res.end();
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/healthz") {
    try {
      loadManifest();
      reply(res, 200, { ok: true });
    } catch (err) {
      reply(res, 503, { ok: false, error: String(err) });
    }
    return;
  }

  if (req.method !== "GET" || url.pathname !== "/v1/check") {
    reply(res, 404, { error: "not found" });
    return;
  }

  const platform = String(url.searchParams.get("platform") || "");
  const channel = String(url.searchParams.get("channel") || "stable");
  const version = String(url.searchParams.get("version") || "0.0.0");

  if (!PLATFORMS.has(platform)) {
    reply(res, 400, { error: "platform must be windows|macos|linux" });
    return;
  }
  if (!CHANNELS.has(channel)) {
    reply(res, 400, { error: "channel must be stable|beta" });
    return;
  }

  let manifest;
  try {
    manifest = loadManifest();
  } catch (err) {
    console.error("[update-server] manifest load failed:", err);
    reply(res, 500, { error: "manifest unavailable" });
    return;
  }

  const entry = manifest?.[channel]?.[platform];
  if (!entry || !entry.version) {
    reply(res, 500, { error: "manifest missing entry" });
    return;
  }

  if (!isNewer(entry.version, version)) {
    res.writeHead(204, { "cache-control": "public, max-age=60" });
    res.end();
    return;
  }

  reply(res, 200, {
    latest: entry.version,
    url: entry.url,
    sha256: entry.sha256,
    releaseNotes: entry.releaseNotes || "",
    mandatory: Boolean(entry.mandatory),
    publishedAt: entry.publishedAt || "",
  });
});

server.listen(PORT, HOST, () => {
  console.log(
    `[update-server] listening on http://${HOST}:${PORT}, manifest=${MANIFEST_PATH}`,
  );
});
