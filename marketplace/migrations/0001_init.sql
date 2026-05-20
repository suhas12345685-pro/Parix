-- Parix marketplace schema (Postgres). The sqlite migrator strips
-- `JSONB`/`TIMESTAMPTZ` and substitutes `TEXT`/`DATETIME`.

CREATE TABLE IF NOT EXISTS skills (
  id           TEXT PRIMARY KEY,        -- matches SkillManifest.id
  name         TEXT NOT NULL,
  description  TEXT NOT NULL,
  author_id    TEXT NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
  repo_url     TEXT NOT NULL,
  license      TEXT NOT NULL,
  -- Latest reviewed version. New versions are rows in skill_versions.
  latest_version TEXT NOT NULL,
  reversibility REAL NOT NULL CHECK (reversibility >= 0 AND reversibility <= 1),
  permissions  JSONB NOT NULL DEFAULT '[]'::jsonb,
  status       TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','banned','unlisted')),
  download_count INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skills_status ON skills(status);
CREATE INDEX IF NOT EXISTS idx_skills_author ON skills(author_id);

CREATE TABLE IF NOT EXISTS authors (
  id           TEXT PRIMARY KEY,        -- github username, normalized
  display_name TEXT NOT NULL,
  banned       BOOLEAN NOT NULL DEFAULT FALSE,
  banned_reason TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS skill_versions (
  skill_id     TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  version      TEXT NOT NULL,
  tag_ref      TEXT NOT NULL,           -- git tag in author's repo
  sha256       TEXT NOT NULL,
  reviewer_id  TEXT,
  reviewed_at  TIMESTAMPTZ,
  changelog    TEXT,
  PRIMARY KEY (skill_id, version)
);

CREATE TABLE IF NOT EXISTS reviews (
  id           SERIAL PRIMARY KEY,
  skill_id     TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  reviewer_id  TEXT NOT NULL,
  rating       INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reviews_skill ON reviews(skill_id);

CREATE TABLE IF NOT EXISTS download_log (
  id           SERIAL PRIMARY KEY,
  skill_id     TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  version      TEXT NOT NULL,
  ts           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  parix_version TEXT,                   -- client-reported, optional
  os_family    TEXT                     -- client-reported, optional
);

CREATE INDEX IF NOT EXISTS idx_downloads_skill_ts ON download_log(skill_id, ts DESC);
