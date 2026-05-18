/**
 * Seed Skills — Pre-populates the skill cache with known-good solutions
 * so Parix can act immediately on first boot without waiting for LLM calls.
 *
 * Run: npx tsx scripts/seed-skills.ts
 */

import { createHash } from 'crypto';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Minimal sql.js bootstrap for seeding
let SQL: any;
let db: any;

interface SkillSeed {
  eventType: string;
  data: Record<string, unknown>;
  taskType: string;
  payload: Record<string, unknown>;
  reason: string;
}

function hashPattern(eventType: string, data: Record<string, unknown>): string {
  const normalized = [
    eventType,
    ...Object.keys(data).sort().map((k) => `${k}=${data[k]}`),
  ].join('|');
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

// ── Skill Seeds ──────────────────────────────────────────────────────

const SEEDS: SkillSeed[] = [
  // ─── Disk & Storage ─────────────────────────────────
  {
    eventType: 'disk_low',
    data: { mount: 'C:\\', free_pct: 5 },
    taskType: 'cli',
    payload: {
      command: 'powershell -Command "Get-ChildItem $env:TEMP -Recurse | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue"',
    },
    reason: 'Clear temp files when disk space is critical on Windows',
  },
  {
    eventType: 'disk_low',
    data: { mount: '/', free_pct: 5 },
    taskType: 'cli',
    payload: {
      command: 'find /tmp -maxdepth 1 -mtime +7 -exec rm -rf {} + 2>/dev/null; echo "Temp cleanup done"',
    },
    reason: 'Clear temp files when disk space is critical on Linux/macOS',
  },
  {
    eventType: 'disk_space_low',
    data: {},
    taskType: 'cli',
    payload: {
      command: 'npm cache clean --force && echo "npm cache cleared"',
    },
    reason: 'Clear npm cache to recover disk space',
  },

  // ─── Process & CPU ──────────────────────────────────
  {
    eventType: 'cpu_high',
    data: { cpu_percent: 95 },
    taskType: 'notification',
    payload: {
      title: 'High CPU Usage',
      body: 'CPU usage at 95%. Check running processes.',
      urgency: 'medium',
    },
    reason: 'Notify on sustained high CPU',
  },
  {
    eventType: 'memory_high',
    data: { used_pct: 92 },
    taskType: 'notification',
    payload: {
      title: 'High Memory Usage',
      body: 'RAM usage at 92%. Consider closing applications.',
      urgency: 'medium',
    },
    reason: 'Notify on high memory pressure',
  },

  // ─── Network ────────────────────────────────────────
  {
    eventType: 'wifi_disconnected',
    data: { last_ssid: '' },
    taskType: 'notification',
    payload: {
      title: 'Wi-Fi Disconnected',
      body: 'Lost network connection. Check your Wi-Fi.',
      urgency: 'high',
    },
    reason: 'Alert user immediately on Wi-Fi disconnect',
  },
  {
    eventType: 'wifi_weak_signal',
    data: { signal_dbm: -75, ssid: '' },
    taskType: 'notification',
    payload: {
      title: 'Weak Wi-Fi Signal',
      body: 'Wi-Fi signal is weak. Move closer to the router or check for interference.',
      urgency: 'low',
    },
    reason: 'Suggest proximity fix for weak signal',
  },

  // ─── Battery & Power ───────────────────────────────
  {
    eventType: 'battery_low',
    data: { percent: 10 },
    taskType: 'notification',
    payload: {
      title: 'Battery Critical',
      body: 'Battery at 10%. Plug in immediately to avoid data loss.',
      urgency: 'high',
    },
    reason: 'Urgent battery warning',
  },
  {
    eventType: 'silent:idle_shutdown',
    data: {},
    taskType: 'notification',
    payload: {
      title: 'Idle + Low Battery',
      body: 'System is idle with low battery. Save your work — shutdown may occur.',
      urgency: 'high',
    },
    reason: 'Preemptive shutdown warning',
  },

  // ─── Terminal Errors ────────────────────────────────
  {
    eventType: 'terminal_error',
    data: { error: 'MODULE_NOT_FOUND' },
    taskType: 'cli',
    payload: { command: 'npm install' },
    reason: 'Auto-install missing Node modules',
  },
  {
    eventType: 'terminal_error',
    data: { error: 'ENOSPC' },
    taskType: 'cli',
    payload: { command: 'npm cache clean --force' },
    reason: 'Clear npm cache when disk is full',
  },
  {
    eventType: 'terminal_error',
    data: { error: 'EACCES' },
    taskType: 'cli',
    payload: { command: 'chmod +x' },
    reason: 'Fix permission denied on executable',
  },
  {
    eventType: 'terminal_error',
    data: { error: 'ECONNREFUSED' },
    taskType: 'notification',
    payload: {
      title: 'Connection Refused',
      body: 'A service connection was refused. Check if the target service is running.',
      urgency: 'medium',
    },
    reason: 'Inform user about connection failures',
  },
  {
    eventType: 'terminal_error',
    data: { error: 'EADDRINUSE' },
    taskType: 'notification',
    payload: {
      title: 'Port Already in Use',
      body: 'A port is already in use by another process. Use `lsof -i :PORT` or `netstat -ano` to find it.',
      urgency: 'medium',
    },
    reason: 'Help user find conflicting port usage',
  },
  {
    eventType: 'terminal_error',
    data: { error: 'ENOMEM' },
    taskType: 'notification',
    payload: {
      title: 'Out of Memory',
      body: 'A process ran out of memory. Close other applications or increase Node\'s heap with --max-old-space-size.',
      urgency: 'high',
    },
    reason: 'Guide user on OOM recovery',
  },

  // ─── USB ────────────────────────────────────────────
  {
    eventType: 'usb_storage_connected',
    data: { name: '', type: 'storage' },
    taskType: 'notification',
    payload: {
      title: 'Storage Device Connected',
      body: 'A USB storage device was plugged in.',
      urgency: 'low',
    },
    reason: 'Inform about storage device connection',
  },

  // ─── App Crashes ────────────────────────────────────
  {
    eventType: 'app_crash',
    data: { app: '', oom: false },
    taskType: 'notification',
    payload: {
      title: 'Application Crashed',
      body: 'An application has crashed. Check the event log for details.',
      urgency: 'high',
    },
    reason: 'Immediate crash notification',
  },
  {
    eventType: 'app_crash',
    data: { app: '', oom: true },
    taskType: 'notification',
    payload: {
      title: 'Application Crashed (OOM)',
      body: 'An application ran out of memory and crashed. Free up RAM by closing other apps.',
      urgency: 'high',
    },
    reason: 'OOM-specific crash guidance',
  },
  {
    eventType: 'app_hang',
    data: { app: '' },
    taskType: 'notification',
    payload: {
      title: 'Application Not Responding',
      body: 'An application stopped responding. You may need to force-quit it.',
      urgency: 'medium',
    },
    reason: 'Hang detection notification',
  },

  // ─── Clipboard ──────────────────────────────────────
  {
    eventType: 'clipboard_sensitive_data',
    data: { matches: ['password'] },
    taskType: 'notification',
    payload: {
      title: 'Sensitive Data on Clipboard',
      body: 'Your clipboard contains sensitive data. Be careful where you paste.',
      urgency: 'high',
    },
    reason: 'Warn about sensitive clipboard content',
  },

  // ─── System Health ──────────────────────────────────
  {
    eventType: 'silent:long_uptime',
    data: { uptime_hours: 72 },
    taskType: 'notification',
    payload: {
      title: 'Long Uptime',
      body: 'System has been running for 72+ hours. Consider a reboot for performance.',
      urgency: 'low',
    },
    reason: 'Suggest periodic reboot',
  },
  {
    eventType: 'swap_high',
    data: { swap_pct: 80 },
    taskType: 'notification',
    payload: {
      title: 'High Swap Usage',
      body: 'Swap usage at 80%. Close heavy applications to reduce memory pressure.',
      urgency: 'low',
    },
    reason: 'Swap pressure guidance',
  },
  {
    eventType: 'silent:tab_overload',
    data: { tab_count: 50 },
    taskType: 'notification',
    payload: {
      title: 'Tab Overload',
      body: 'You have 50+ browser tabs open. Consider bookmarking and closing some.',
      urgency: 'low',
    },
    reason: 'Tab management suggestion',
  },

  // ─── Service Management ─────────────────────────────
  {
    eventType: 'service_down',
    data: { service_name: 'docker' },
    taskType: 'cli',
    payload: { command: 'systemctl --user restart docker' },
    reason: 'Auto-restart Docker service',
  },
  {
    eventType: 'service_down',
    data: { service_name: 'postgresql' },
    taskType: 'cli',
    payload: { command: 'systemctl --user restart postgresql' },
    reason: 'Auto-restart PostgreSQL service',
  },

  // ─── Git Operations ─────────────────────────────────
  {
    eventType: 'terminal_error',
    data: { error: 'fatal: not a git repository' },
    taskType: 'notification',
    payload: {
      title: 'Not a Git Repository',
      body: 'This directory is not a Git repo. Run `git init` to initialize one.',
      urgency: 'low',
    },
    reason: 'Guide user on git init',
  },
  {
    eventType: 'terminal_error',
    data: { error: 'MERGE_CONFLICT' },
    taskType: 'notification',
    payload: {
      title: 'Merge Conflict',
      body: 'Git merge conflict detected. Resolve conflicts in the marked files, then `git add` and `git commit`.',
      urgency: 'medium',
    },
    reason: 'Merge conflict guidance',
  },

  // ─── Docker ─────────────────────────────────────────
  {
    eventType: 'terminal_error',
    data: { error: 'docker: Cannot connect to the Docker daemon' },
    taskType: 'cli',
    payload: { command: 'systemctl start docker || open -a Docker' },
    reason: 'Start Docker daemon when not running',
  },
  {
    eventType: 'terminal_error',
    data: { error: 'No space left on device' },
    taskType: 'cli',
    payload: { command: 'docker system prune -f && echo "Docker cleanup done"' },
    reason: 'Prune Docker resources to free space',
  },

  // ─── Python ─────────────────────────────────────────
  {
    eventType: 'terminal_error',
    data: { error: 'ModuleNotFoundError' },
    taskType: 'cli',
    payload: { command: 'pip install -r requirements.txt' },
    reason: 'Install missing Python modules',
  },
  {
    eventType: 'terminal_error',
    data: { error: 'pip: command not found' },
    taskType: 'notification',
    payload: {
      title: 'pip Not Found',
      body: 'Python pip is not installed. Try `python3 -m ensurepip` or install it from your package manager.',
      urgency: 'medium',
    },
    reason: 'Guide pip installation',
  },
];

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const initSqlJs = (await import('sql.js')).default;
  SQL = await initSqlJs();

  const DATA_DIR = resolve(__dirname, '../data');
  mkdirSync(DATA_DIR, { recursive: true });

  const dbPath = resolve(DATA_DIR, 'memory.db');
  const { readFileSync, writeFileSync, existsSync } = await import('fs');

  if (existsSync(dbPath)) {
    const buffer = readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Ensure skill_cache table exists
  db.run(`
    CREATE TABLE IF NOT EXISTS skill_cache (
      pattern_hash TEXT PRIMARY KEY,
      pattern_text TEXT NOT NULL,
      solution_json TEXT NOT NULL,
      success_count INTEGER DEFAULT 0,
      fail_count INTEGER DEFAULT 0,
      model_used TEXT,
      avg_latency_ms REAL DEFAULT 0,
      last_used_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  let inserted = 0;
  let skipped = 0;

  for (const seed of SEEDS) {
    const hash = hashPattern(seed.eventType, seed.data);
    const patternText = `${seed.eventType}:${JSON.stringify(seed.data)}`;
    const solutionJson = JSON.stringify({
      taskType: seed.taskType,
      payload: seed.payload,
    });

    // Don't overwrite existing skills (user-learned skills take priority)
    const existing = db.exec(
      `SELECT pattern_hash FROM skill_cache WHERE pattern_hash = '${hash}'`
    );
    if (existing.length > 0 && existing[0].values.length > 0) {
      skipped++;
      continue;
    }

    db.run(
      `INSERT INTO skill_cache (pattern_hash, pattern_text, solution_json, success_count, fail_count, model_used, avg_latency_ms)
       VALUES (?, ?, ?, 3, 0, 'seed', 0)`,
      [hash, patternText, solutionJson]
    );

    inserted++;
    console.log(`  ✓ ${seed.eventType} → ${seed.taskType} (${seed.reason})`);
  }

  // Persist
  const data = db.export();
  writeFileSync(dbPath, Buffer.from(data));
  db.close();

  console.log('');
  console.log(`[SEED] Done: ${inserted} inserted, ${skipped} skipped (already exist)`);
  console.log(`[SEED] Total seed skills: ${SEEDS.length}`);
  console.log(`[SEED] Database: ${dbPath}`);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
