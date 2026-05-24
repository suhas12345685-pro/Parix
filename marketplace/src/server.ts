/**
 * Parix marketplace API — read-mostly registry of approved third-party
 * skills. Write endpoints (submission, review) are gated by a static
 * admin token until real auth lands (Phase 4).
 *
 * Endpoints:
 *   GET    /v1/skills                   — list approved skills
 *   GET    /v1/skills/:id               — skill detail + versions
 *   GET    /v1/skills/:id/download      — bumps counter, redirects to repo tag URL
 *   POST   /v1/skills/:id/reviews       — submit a review (rating 1-5)
 *   POST   /v1/admin/skills             — admin: create a new submission
 *   POST   /v1/admin/skills/:id/status  — admin: change status (approved/banned/…)
 *   POST   /v1/admin/skills/:id/versions — admin: add a reviewed version
 *
 * GET endpoints are public + cacheable. POST endpoints require
 * `Authorization: Bearer <MARKETPLACE_ADMIN_TOKEN>` (env var).
 */
import express, { type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { makeDb, type DbAdapter } from "./db.js";

const PORT = Number(process.env.PORT || 8787);
const ADMIN_TOKEN = process.env.MARKETPLACE_ADMIN_TOKEN || "";

const app = express();
app.use(express.json({ limit: "256kb" }));

let db: DbAdapter;
const skillDeltas: Array<Record<string, unknown> & { revision: string }> = [];

function recordSkillDelta(delta: Record<string, unknown>): string {
  const revision = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  skillDeltas.push({ ...delta, revision });
  if (skillDeltas.length > 500) skillDeltas.splice(0, skillDeltas.length - 500);
  return revision;
}

// ─── Helpers ──────────────────────────────────────────────────────────
function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!ADMIN_TOKEN) {
    res.status(503).json({ error: "MARKETPLACE_ADMIN_TOKEN not configured" });
    return;
  }
  const auth = req.header("authorization") || "";
  const expected = `Bearer ${ADMIN_TOKEN}`;
  if (auth !== expected) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}

function badRequest(res: Response, errors: unknown): void {
  res.status(400).json({ error: "bad request", details: errors });
}

const CreateSkillSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/),
  name: z.string().min(1).max(128),
  description: z.string().min(1).max(200),
  authorId: z.string().min(1).max(64),
  repoUrl: z.string().url(),
  license: z.string().min(1).max(64),
  reversibility: z.number().min(0).max(1),
  permissions: z.array(z.string()),
  initialVersion: z.string(),
  tagRef: z.string(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

const ReviewSchema = z.object({
  reviewerId: z.string().min(1).max(64),
  rating: z.number().int().min(1).max(5),
  body: z.string().max(2000).optional(),
});

const StatusSchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "banned", "unlisted"]),
  reason: z.string().max(500).optional(),
});

const AddVersionSchema = z.object({
  version: z.string(),
  tagRef: z.string(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  reviewerId: z.string().min(1).max(64),
  changelog: z.string().max(4000).optional(),
});

const SkillDeltaSchema = z.object({
  op: z.enum(["upsert", "remove", "refresh"]),
  id: z.string().min(1),
  manifest: z.record(z.string(), z.unknown()).optional(),
  skillDir: z.string().optional(),
});

// ─── Routes ───────────────────────────────────────────────────────────
app.get("/healthz", async (_req, res) => {
  try {
    await db.query("SELECT 1");
    res.json({ ok: true, db: db.kind });
  } catch (err) {
    res.status(503).json({ ok: false, error: String(err) });
  }
});

app.get("/v1/skills", async (req, res) => {
  const status = String(req.query.status || "approved");
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const rows = await db.query(
    `SELECT id, name, description, author_id, license, latest_version,
            reversibility, download_count, updated_at
       FROM skills
      WHERE status = ?
      ORDER BY download_count DESC, updated_at DESC
      LIMIT ?`,
    [status, limit],
  );
  res.set("Cache-Control", "public, max-age=60").json({ skills: rows });
});

app.get("/v1/skills/:id", async (req, res) => {
  const [skill] = await db.query(
    `SELECT * FROM skills WHERE id = ?`,
    [req.params.id],
  );
  if (!skill) return res.status(404).json({ error: "not found" });
  const versions = await db.query(
    `SELECT version, tag_ref, sha256, reviewer_id, reviewed_at, changelog
       FROM skill_versions WHERE skill_id = ? ORDER BY reviewed_at DESC`,
    [req.params.id],
  );
  res.set("Cache-Control", "public, max-age=60").json({ skill, versions });
});

app.get("/v1/skills/:id/download", async (req, res) => {
  const [skill] = await db.query(
    `SELECT id, repo_url, latest_version, status FROM skills WHERE id = ?`,
    [req.params.id],
  );
  if (!skill || skill.status !== "approved") {
    return res.status(404).json({ error: "not found" });
  }
  const version = String(req.query.version || skill.latest_version);
  const [v] = await db.query(
    `SELECT tag_ref FROM skill_versions WHERE skill_id = ? AND version = ?`,
    [skill.id, version],
  );
  if (!v) return res.status(404).json({ error: "version not found" });

  // Best-effort log; never block the redirect on logging.
  db.query(
    `INSERT INTO download_log (skill_id, version, parix_version, os_family)
       VALUES (?, ?, ?, ?)`,
    [
      skill.id,
      version,
      String(req.query.parix_version || "").slice(0, 32) || null,
      String(req.query.os || "").slice(0, 16) || null,
    ],
  ).catch(() => {});
  db.query(
    `UPDATE skills SET download_count = download_count + 1 WHERE id = ?`,
    [skill.id],
  ).catch(() => {});

  // Redirect to the tarball URL the user's hatchery will fetch.
  res.redirect(302, `${skill.repo_url.replace(/\.git$/, "")}/archive/refs/tags/${v.tag_ref}.tar.gz`);
});

app.get("/v1/skill-deltas", async (req, res) => {
  const cursor = String(req.query.cursor || "");
  const start = cursor
    ? skillDeltas.findIndex((delta) => delta.revision === cursor) + 1
    : 0;
  const deltas = skillDeltas.slice(Math.max(0, start));
  res.json({
    cursor: (deltas.at(-1)?.revision ?? cursor) || null,
    deltas,
  });
});

app.post("/v1/skills/:id/reviews", async (req, res) => {
  const parsed = ReviewSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.format());
  const { reviewerId, rating, body } = parsed.data;
  const [exists] = await db.query(
    `SELECT id FROM skills WHERE id = ? AND status = 'approved'`,
    [req.params.id],
  );
  if (!exists) return res.status(404).json({ error: "not found" });
  await db.query(
    `INSERT INTO reviews (skill_id, reviewer_id, rating, body) VALUES (?, ?, ?, ?)`,
    [req.params.id, reviewerId, rating, body ?? null],
  );
  res.status(201).json({ ok: true });
});

// ─── Admin ────────────────────────────────────────────────────────────
app.post("/v1/admin/skills", requireAdmin, async (req, res) => {
  const parsed = CreateSkillSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.format());
  const p = parsed.data;
  await db.query(
    `INSERT INTO authors (id, display_name) VALUES (?, ?)
       ON CONFLICT (id) DO NOTHING`,
    [p.authorId, p.authorId],
  );
  await db.query(
    `INSERT INTO skills
       (id, name, description, author_id, repo_url, license, latest_version,
        reversibility, permissions, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [
      p.id, p.name, p.description, p.authorId, p.repoUrl, p.license,
      p.initialVersion, p.reversibility, JSON.stringify(p.permissions),
    ],
  );
  await db.query(
    `INSERT INTO skill_versions (skill_id, version, tag_ref, sha256) VALUES (?, ?, ?, ?)`,
    [p.id, p.initialVersion, p.tagRef, p.sha256],
  );
  res.status(201).json({ ok: true, id: p.id });
});

app.post("/v1/admin/skills/:id/status", requireAdmin, async (req, res) => {
  const parsed = StatusSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.format());
  const { status, reason } = parsed.data;
  const result = await db.query(
    `UPDATE skills SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [status, req.params.id],
  );
  // SQLite returns [] from non-SELECT; that's expected.
  void result;
  if (status === "banned" && reason) {
    await db.query(
      `UPDATE authors SET banned = 1, banned_reason = ?
         WHERE id = (SELECT author_id FROM skills WHERE id = ?)`,
      [reason, req.params.id],
    );
  }
  const revision =
    status === "banned" || status === "rejected"
      ? recordSkillDelta({ op: "remove", id: req.params.id })
      : recordSkillDelta({ op: "refresh", id: req.params.id });
  res.json({ ok: true, revision });
});

app.post("/v1/admin/skills/:id/versions", requireAdmin, async (req, res) => {
  const parsed = AddVersionSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.format());
  const p = parsed.data;
  await db.query(
    `INSERT INTO skill_versions
       (skill_id, version, tag_ref, sha256, reviewer_id, reviewed_at, changelog)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
    [req.params.id, p.version, p.tagRef, p.sha256, p.reviewerId, p.changelog ?? null],
  );
  await db.query(
    `UPDATE skills SET latest_version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [p.version, req.params.id],
  );
  const revision = recordSkillDelta({ op: "refresh", id: req.params.id });
  res.status(201).json({ ok: true, revision });
});

app.post("/v1/admin/skill-deltas", requireAdmin, async (req, res) => {
  const parsed = SkillDeltaSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.format());
  const revision = recordSkillDelta(parsed.data);
  res.status(202).json({ ok: true, revision });
});

// ─── Bootstrap ────────────────────────────────────────────────────────
async function main() {
  db = makeDb();
  await db.migrate();
  app.listen(PORT, () => {
    console.log(`[marketplace] listening on :${PORT} (${db.kind})`);
  });
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, async () => {
      await db.close();
      process.exit(0);
    });
  }
}

main().catch((err) => {
  console.error("[marketplace] fatal:", err);
  process.exit(1);
});
