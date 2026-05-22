-- Parix Enterprise PostgreSQL/Supabase schema.
-- Every runtime table carries tenant_id so Atrium instances can scale
-- horizontally without file locks or cross-tenant state bleed.

CREATE TABLE IF NOT EXISTS tasks (
  tenant_id TEXT NOT NULL DEFAULT 'local',
  task_id TEXT NOT NULL,
  type TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending',
  payload JSONB,
  result TEXT,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (tenant_id, task_id)
);
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_state ON tasks(tenant_id, state);

CREATE TABLE IF NOT EXISTS events (
  tenant_id TEXT NOT NULL DEFAULT 'local',
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  data JSONB,
  confidence REAL NOT NULL DEFAULT 0.0,
  processed BOOLEAN DEFAULT FALSE,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (tenant_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_events_tenant_ts ON events(tenant_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_tenant_type ON events(tenant_id, event_type);

CREATE TABLE IF NOT EXISTS checkpoints (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'local',
  data JSONB NOT NULL,
  ts BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_checkpoints_tenant_ts ON checkpoints(tenant_id, ts DESC);

CREATE TABLE IF NOT EXISTS llm_config (
  tenant_id TEXT NOT NULL DEFAULT 'local',
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  api_key_ref TEXT,
  enabled BOOLEAN DEFAULT TRUE,
  priority INTEGER DEFAULT 5,
  token_spend INTEGER DEFAULT 0,
  PRIMARY KEY (tenant_id, provider)
);

CREATE TABLE IF NOT EXISTS dead_letter (
  tenant_id TEXT NOT NULL DEFAULT 'local',
  task_id TEXT NOT NULL,
  event_type TEXT,
  payload JSONB,
  attempts INTEGER,
  last_error TEXT,
  created_at TIMESTAMPTZ,
  notified BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (tenant_id, task_id)
);

CREATE TABLE IF NOT EXISTS user_context (
  tenant_id TEXT NOT NULL DEFAULT 'local',
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  source TEXT,
  confidence REAL DEFAULT 1.0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (tenant_id, key)
);

CREATE TABLE IF NOT EXISTS feedback (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'local',
  task_id TEXT NOT NULL,
  event_type TEXT,
  action TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS skill_cache (
  tenant_id TEXT NOT NULL DEFAULT 'local',
  pattern_hash TEXT NOT NULL,
  pattern_text TEXT NOT NULL,
  solution_json JSONB NOT NULL,
  success_count INTEGER DEFAULT 1,
  fail_count INTEGER DEFAULT 0,
  model_used TEXT,
  avg_latency_ms INTEGER,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (tenant_id, pattern_hash)
);

CREATE TABLE IF NOT EXISTS model_performance (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'local',
  task_type TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT,
  latency_ms INTEGER,
  success BOOLEAN,
  user_action TEXT,
  ts TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS event_sequences (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'local',
  sequence JSONB NOT NULL,
  next_event TEXT NOT NULL,
  observed_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_seq_tenant_lookup ON event_sequences(tenant_id);

CREATE TABLE IF NOT EXISTS token_usage (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'local',
  provider TEXT NOT NULL,
  model TEXT,
  tokens_in INTEGER,
  tokens_out INTEGER,
  cost_usd REAL,
  task_id TEXT,
  ts TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_usage_tenant_ts ON token_usage(tenant_id, ts);

CREATE TABLE IF NOT EXISTS episodes (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'local',
  summary TEXT NOT NULL,
  start_ts TIMESTAMPTZ,
  end_ts TIMESTAMPTZ,
  task_ids JSONB,
  key_entities JSONB,
  outcome TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS situations (
  tenant_id TEXT NOT NULL DEFAULT 'local',
  id TEXT NOT NULL,
  ts BIGINT NOT NULL,
  signals JSONB NOT NULL,
  inferred TEXT,
  confidence REAL,
  user_state TEXT,
  acted_on BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_situations_tenant_ts ON situations(tenant_id, ts DESC);

CREATE TABLE IF NOT EXISTS recall_log (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'local',
  episode_id BIGINT NOT NULL,
  ts BIGINT NOT NULL,
  user_action TEXT
);

CREATE TABLE IF NOT EXISTS surprises (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'local',
  type TEXT NOT NULL,
  payload JSONB,
  ts BIGINT NOT NULL,
  user_action TEXT,
  actioned_at BIGINT
);

CREATE TABLE IF NOT EXISTS audit_ledger (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'local',
  ts TIMESTAMPTZ DEFAULT NOW(),
  actor TEXT,
  action TEXT NOT NULL,
  task_id TEXT,
  payload JSONB,
  prev_hash TEXT,
  this_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS channel_config (
  tenant_id TEXT NOT NULL DEFAULT 'local',
  channel_id TEXT NOT NULL,
  enabled BOOLEAN DEFAULT FALSE,
  config JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (tenant_id, channel_id)
);

CREATE TABLE IF NOT EXISTS onboarding_state (
  tenant_id TEXT NOT NULL DEFAULT 'local',
  id INTEGER NOT NULL DEFAULT 1,
  completed BOOLEAN DEFAULT FALSE,
  mode TEXT,
  profile_ver TEXT,
  completed_at TIMESTAMPTZ,
  reset_count INTEGER DEFAULT 0,
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS cognitive_facts (
  tenant_id TEXT NOT NULL DEFAULT 'local',
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  kind TEXT NOT NULL,
  confidence REAL DEFAULT 0.5,
  evidence JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (tenant_id, key)
);
CREATE INDEX IF NOT EXISTS idx_cognitive_facts_tenant_kind ON cognitive_facts(tenant_id, kind);

CREATE TABLE IF NOT EXISTS cognitive_episodes (
  tenant_id TEXT NOT NULL DEFAULT 'local',
  id TEXT NOT NULL,
  ts BIGINT NOT NULL,
  trigger_type TEXT NOT NULL,
  inferred_goal TEXT,
  desire_json JSONB,
  hypotheses_json JSONB,
  decision_json JSONB,
  outcome_json JSONB,
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_cognitive_episodes_tenant_ts ON cognitive_episodes(tenant_id, ts DESC);

CREATE TABLE IF NOT EXISTS user_preference_signals (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'local',
  ts BIGINT NOT NULL,
  signal_type TEXT NOT NULL,
  data JSONB,
  weight REAL DEFAULT 0.5
);

CREATE TABLE IF NOT EXISTS cron_tasks (
  tenant_id TEXT NOT NULL DEFAULT 'local',
  task_id TEXT NOT NULL,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  interval_minutes INTEGER NOT NULL DEFAULT 60,
  enabled BOOLEAN DEFAULT TRUE,
  source TEXT DEFAULT 'hatchery',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (tenant_id, task_id)
);

CREATE TABLE IF NOT EXISTS skill_setup (
  tenant_id TEXT NOT NULL DEFAULT 'local',
  skill_id TEXT NOT NULL,
  source TEXT,
  requirements JSONB,
  configured BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (tenant_id, skill_id)
);

CREATE TABLE IF NOT EXISTS learnings (
  tenant_id TEXT NOT NULL DEFAULT 'local',
  id TEXT NOT NULL,
  domain TEXT NOT NULL,
  insight TEXT NOT NULL,
  "constraint" TEXT,
  approach TEXT,
  outcome TEXT NOT NULL DEFAULT 'success',
  confidence REAL DEFAULT 0.5,
  tags JSONB,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS storage_credentials (
  tenant_id TEXT NOT NULL DEFAULT 'local',
  provider TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (tenant_id, provider, key)
);

CREATE TABLE IF NOT EXISTS storage_sync_state (
  tenant_id TEXT NOT NULL DEFAULT 'local',
  provider TEXT NOT NULL,
  remote_id TEXT NOT NULL,
  local_path TEXT,
  modified BIGINT,
  size BIGINT,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (tenant_id, provider, remote_id)
);

CREATE TABLE IF NOT EXISTS plan_trees (
  tenant_id TEXT NOT NULL DEFAULT 'local',
  id TEXT NOT NULL,
  root_goal TEXT NOT NULL,
  trigger TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  nodes_json JSONB NOT NULL,
  graph_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_plan_trees_tenant_status ON plan_trees(tenant_id, status);

CREATE TABLE IF NOT EXISTS narratives (
  tenant_id TEXT NOT NULL DEFAULT 'local',
  id TEXT NOT NULL,
  goal TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  trigger TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  blocked_reason TEXT,
  attempts_json JSONB NOT NULL DEFAULT '[]',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS calibration_records (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'local',
  skill_manifest_id TEXT,
  predicted_confidence REAL NOT NULL,
  actual_outcome BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_calibration_tenant_skill ON calibration_records(tenant_id, skill_manifest_id, created_at DESC);

CREATE TABLE IF NOT EXISTS attention_log (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'local',
  event_type TEXT NOT NULL,
  admitted BOOLEAN NOT NULL,
  reason TEXT,
  focus TEXT,
  focus_strength REAL,
  contextual_load TEXT,
  token_load INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accessibility_snapshots (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'local',
  snapshot_id TEXT NOT NULL,
  focused_app TEXT,
  backend_used TEXT,
  focused_element_role TEXT,
  focused_element_name TEXT,
  tree_summary_json JSONB,
  confidence REAL,
  entropy REAL,
  visual_fallback_requested BOOLEAN DEFAULT FALSE,
  ts REAL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_a11y_tenant_ts ON accessibility_snapshots(tenant_id, ts DESC);

CREATE TABLE IF NOT EXISTS pulse_memory (
  tenant_id TEXT NOT NULL DEFAULT 'local',
  key TEXT NOT NULL,
  value_json JSONB NOT NULL,
  confidence REAL DEFAULT 0.5,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (tenant_id, key)
);

CREATE TABLE IF NOT EXISTS error_shadow_drafts (
  tenant_id TEXT NOT NULL DEFAULT 'local',
  id TEXT NOT NULL,
  event_hash TEXT NOT NULL,
  cwd TEXT,
  error_excerpt TEXT NOT NULL,
  draft_path TEXT NOT NULL,
  suggested_fix TEXT,
  confidence REAL NOT NULL,
  notification_score REAL NOT NULL,
  notification_channel TEXT NOT NULL DEFAULT 'silent',
  repeat_count INTEGER NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL,
  last_seen_at BIGINT NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS dependency_foresight_drafts (
  tenant_id TEXT NOT NULL DEFAULT 'local',
  id TEXT NOT NULL,
  import_hash TEXT NOT NULL,
  cwd TEXT,
  file_path TEXT,
  manifest_path TEXT,
  missing_imports_json JSONB NOT NULL,
  draft_path TEXT NOT NULL,
  suggested_commands_json JSONB,
  confidence REAL NOT NULL,
  notification_score REAL NOT NULL,
  notification_channel TEXT NOT NULL DEFAULT 'silent',
  created_at BIGINT NOT NULL,
  last_seen_at BIGINT NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS cognition_metrics (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'local',
  prompt_hash TEXT NOT NULL,
  execution_time_ms INTEGER NOT NULL,
  success_score REAL NOT NULL DEFAULT 0.0,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  pattern_type TEXT,
  context_summary TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evolution_ledger (
  tenant_id TEXT NOT NULL DEFAULT 'local',
  id TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  old_prompt_summary TEXT,
  new_prompt_summary TEXT,
  improvement_delta REAL,
  benchmark_pass BOOLEAN NOT NULL DEFAULT FALSE,
  applied BOOLEAN NOT NULL DEFAULT FALSE,
  draft_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS benchmark_suite (
  tenant_id TEXT NOT NULL DEFAULT 'local',
  id TEXT NOT NULL,
  task_name TEXT NOT NULL,
  input_json JSONB NOT NULL,
  expected_output_json JSONB NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0,
  last_run_at TIMESTAMPTZ,
  last_pass BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (tenant_id, id)
);
