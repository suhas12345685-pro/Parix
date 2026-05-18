-- Parix SQLite Schema — All 16 tables
-- Created at boot by atrium/src/memory/db.ts

-- Phase 1: Core
CREATE TABLE IF NOT EXISTS tasks (
  task_id     TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  state       TEXT NOT NULL DEFAULT 'pending',  -- pending | acked | completed | failed | dead
  payload     TEXT,
  result      TEXT,
  error       TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS events (
  event_id    TEXT PRIMARY KEY,
  event_type  TEXT NOT NULL,
  data        TEXT,
  confidence  REAL NOT NULL DEFAULT 0.0,
  processed   INTEGER DEFAULT 0,
  timestamp   DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);

-- Phase 1: Crash recovery
CREATE TABLE IF NOT EXISTS checkpoints (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  data  TEXT NOT NULL,
  ts    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_checkpoints_ts ON checkpoints(ts DESC);

-- Phase 2: LLM
CREATE TABLE IF NOT EXISTS llm_config (
  provider    TEXT PRIMARY KEY,
  model       TEXT NOT NULL,
  api_key_ref TEXT,
  enabled     INTEGER DEFAULT 1,
  priority    INTEGER DEFAULT 5,
  token_spend INTEGER DEFAULT 0
);

-- Phase 2: Queue
CREATE TABLE IF NOT EXISTS dead_letter (
  task_id     TEXT PRIMARY KEY,
  event_type  TEXT,
  payload     TEXT,
  attempts    INTEGER,
  last_error  TEXT,
  created_at  DATETIME,
  notified    INTEGER DEFAULT 0
);

-- Phase 2: PKG
CREATE TABLE IF NOT EXISTS user_context (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  source      TEXT,
  confidence  REAL DEFAULT 1.0,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Phase 2: Feedback
CREATE TABLE IF NOT EXISTS feedback (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id     TEXT NOT NULL,
  event_type  TEXT,
  action      TEXT,
  timestamp   DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Phase 2: Skill cache (logging starts Day 4, cache logic v0.2)
CREATE TABLE IF NOT EXISTS skill_cache (
  pattern_hash   TEXT PRIMARY KEY,
  pattern_text   TEXT NOT NULL,
  solution_json  TEXT NOT NULL,
  success_count  INTEGER DEFAULT 1,
  fail_count     INTEGER DEFAULT 0,
  model_used     TEXT,
  avg_latency_ms INTEGER,
  last_used_at   DATETIME,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Phase 2: Model performance (logging starts Day 4, analysis v0.2)
CREATE TABLE IF NOT EXISTS model_performance (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  task_type   TEXT NOT NULL,
  provider    TEXT NOT NULL,
  model       TEXT,
  latency_ms  INTEGER,
  success     INTEGER,
  user_action TEXT,
  ts          DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Phase 2: Sequence learning (logging starts Day 4, prediction v0.2)
CREATE TABLE IF NOT EXISTS event_sequences (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sequence    TEXT NOT NULL,
  next_event  TEXT NOT NULL,
  observed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_seq_lookup ON event_sequences(sequence);

-- Phase 4: Token usage
CREATE TABLE IF NOT EXISTS token_usage (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  provider    TEXT NOT NULL,
  model       TEXT,
  tokens_in   INTEGER,
  tokens_out  INTEGER,
  cost_usd    REAL,
  task_id     TEXT,
  ts          DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_usage_ts ON token_usage(ts);

-- v0.2: Episodic memory
CREATE TABLE IF NOT EXISTS episodes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  summary     TEXT NOT NULL,
  start_ts    DATETIME,
  end_ts      DATETIME,
  task_ids    TEXT,
  key_entities TEXT,
  outcome     TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- v0.2: Context fusion situations
CREATE TABLE IF NOT EXISTS situations (
  id          TEXT PRIMARY KEY,
  ts          INTEGER NOT NULL,
  signals     TEXT NOT NULL,
  inferred    TEXT,
  confidence  REAL,
  user_state  TEXT,
  acted_on    INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_situations_ts ON situations(ts DESC);

-- v0.2: Recall daemon log
CREATE TABLE IF NOT EXISTS recall_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  episode_id  INTEGER NOT NULL,
  ts          INTEGER NOT NULL,
  user_action TEXT
);

-- Phase 4: Surprise tracking
CREATE TABLE IF NOT EXISTS surprises (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  type        TEXT NOT NULL,
  payload     TEXT,
  ts          INTEGER NOT NULL,
  user_action TEXT,
  actioned_at INTEGER
);

-- Enterprise: Audit ledger
CREATE TABLE IF NOT EXISTS audit_ledger (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          DATETIME DEFAULT CURRENT_TIMESTAMP,
  actor       TEXT,
  action      TEXT NOT NULL,
  task_id     TEXT,
  payload     TEXT,
  prev_hash   TEXT,
  this_hash   TEXT NOT NULL
);

-- Channel config (stores credentials references + settings)
CREATE TABLE IF NOT EXISTS channel_config (
  channel_id  TEXT PRIMARY KEY,
  enabled     INTEGER DEFAULT 0,
  config      TEXT,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Hatchery: onboarding completion state (singleton row)
CREATE TABLE IF NOT EXISTS onboarding_state (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  completed   INTEGER DEFAULT 0,
  mode        TEXT,
  profile_ver TEXT,
  completed_at DATETIME,
  reset_count INTEGER DEFAULT 0
);

-- Cognition: durable user/world model
CREATE TABLE IF NOT EXISTS cognitive_facts (
  key          TEXT PRIMARY KEY,
  value        TEXT NOT NULL,
  kind         TEXT NOT NULL, -- preference | world | goal | routine | belief
  confidence   REAL DEFAULT 0.5,
  evidence     TEXT,
  updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cognitive_facts_kind ON cognitive_facts(kind);

CREATE TABLE IF NOT EXISTS cognitive_episodes (
  id             TEXT PRIMARY KEY,
  ts             INTEGER NOT NULL,
  trigger_type   TEXT NOT NULL,
  inferred_goal  TEXT,
  desire_json    TEXT,
  hypotheses_json TEXT,
  decision_json  TEXT,
  outcome_json   TEXT
);
CREATE INDEX IF NOT EXISTS idx_cognitive_episodes_ts ON cognitive_episodes(ts DESC);

CREATE TABLE IF NOT EXISTS user_preference_signals (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          INTEGER NOT NULL,
  signal_type TEXT NOT NULL,
  data        TEXT,
  weight      REAL DEFAULT 0.5
);
CREATE INDEX IF NOT EXISTS idx_preference_signals_ts ON user_preference_signals(ts DESC);

-- Hatchery: user-created recurring tasks
CREATE TABLE IF NOT EXISTS cron_tasks (
  task_id     TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  prompt      TEXT NOT NULL,
  interval_minutes INTEGER NOT NULL DEFAULT 60,
  enabled     INTEGER DEFAULT 1,
  source      TEXT DEFAULT 'hatchery',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cron_tasks_enabled ON cron_tasks(enabled);

-- Hatchery: installed skill metadata and setup requirements
CREATE TABLE IF NOT EXISTS skill_setup (
  skill_id    TEXT PRIMARY KEY,
  source      TEXT,
  requirements TEXT,
  configured  INTEGER DEFAULT 0,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- v0.3: Recall daemon — persistent learnings
CREATE TABLE IF NOT EXISTS learnings (
  id          TEXT PRIMARY KEY,
  domain      TEXT NOT NULL,
  insight     TEXT NOT NULL,
  "constraint" TEXT,
  approach    TEXT,
  outcome     TEXT NOT NULL DEFAULT 'success',
  confidence  REAL DEFAULT 0.5,
  tags        TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_learnings_domain ON learnings(domain);
CREATE INDEX IF NOT EXISTS idx_learnings_confidence ON learnings(confidence DESC);

-- Phase 4: storage provider credentials and sync configuration
CREATE TABLE IF NOT EXISTS storage_credentials (
  provider    TEXT NOT NULL,
  key         TEXT NOT NULL,
  value       TEXT NOT NULL,
  enabled     INTEGER DEFAULT 1,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (provider, key)
);
CREATE INDEX IF NOT EXISTS idx_storage_credentials_provider ON storage_credentials(provider);

CREATE TABLE IF NOT EXISTS storage_sync_state (
  provider    TEXT NOT NULL,
  remote_id   TEXT NOT NULL,
  local_path  TEXT,
  modified    INTEGER,
  size        INTEGER,
  synced_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (provider, remote_id)
);

-- Cognition v1.3: Planning
CREATE TABLE IF NOT EXISTS plan_trees (
  id TEXT PRIMARY KEY,
  root_goal TEXT NOT NULL,
  trigger TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  nodes_json TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_plan_trees_status ON plan_trees(status);

-- Cognition v1.3: Narratives (Long-Horizon)
CREATE TABLE IF NOT EXISTS narratives (
  id TEXT PRIMARY KEY,
  goal TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  trigger TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  blocked_reason TEXT,
  attempts_json TEXT NOT NULL DEFAULT '[]',
  started_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_activity_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_narratives_status ON narratives(status);

-- Cognition v1.3: Metacognition Calibration
CREATE TABLE IF NOT EXISTS calibration_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  predicted_confidence REAL NOT NULL,
  actual_outcome INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Cognition v1.3: Attention Log
CREATE TABLE IF NOT EXISTS attention_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  admitted INTEGER NOT NULL,
  reason TEXT,
  focus TEXT,
  focus_strength REAL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Accessibility v0.1.6: each row = one ACCESSIBILITY_SNAPSHOT from hands.
-- The poller debounces on UI state change, so rows mark transitions.
CREATE TABLE IF NOT EXISTS accessibility_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id TEXT NOT NULL,
  focused_app TEXT,
  backend_used TEXT,
  focused_element_role TEXT,
  focused_element_name TEXT,
  tree_summary_json TEXT,
  confidence REAL,
  ts REAL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_a11y_snapshot_ts ON accessibility_snapshots(ts DESC);
