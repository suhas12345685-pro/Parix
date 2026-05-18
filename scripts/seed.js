/**
 * Parix — Database Seeder
 *
 * Populates the local SQLite database with realistic dummy data
 * for development and testing. Uses fixtures from qa/fixtures/.
 *
 * Usage: node scripts/seed.js [--reset]
 */

const fs = require("fs");
const path = require("path");

const DB_PATH = process.env.PARIX_DB_PATH || path.join(__dirname, "..", "data", "parix.db");
const FIXTURES_PATH = path.join(__dirname, "..", "qa", "fixtures", "protocol-fixtures.json");
const SCHEMA_PATH = path.join(__dirname, "..", "shared", "schema.sql");
const RESET = process.argv.includes("--reset");

async function main() {
  console.log("Parix Database Seeder");
  console.log(`   Database: ${DB_PATH}`);
  console.log(`   Fixtures: ${FIXTURES_PATH}`);
  console.log(`   Reset:    ${RESET}`);
  console.log("");

  let initSqlJs;
  try {
    initSqlJs = require("sql.js");
  } catch {
    console.error("sql.js not installed. Run: npm install");
    process.exit(1);
  }

  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const SQL = await initSqlJs();

  let db;
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  if (fs.existsSync(SCHEMA_PATH)) {
    const schema = fs.readFileSync(SCHEMA_PATH, "utf-8");
    db.run(schema);
    console.log("+ Schema applied");
  }

  if (RESET) {
    console.log("! Resetting database...");
    db.run("DELETE FROM tasks;");
    db.run("DELETE FROM events;");
    db.run("DELETE FROM token_usage;");
    db.run("DELETE FROM checkpoints;");
    console.log("+ Tables cleared");
  }

  if (!fs.existsSync(FIXTURES_PATH)) {
    console.warn("! No fixtures file found, seeding with defaults");
    seedDefaults(db);
  } else {
    const fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, "utf-8"));
    seedFromFixtures(db, fixtures);
  }

  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
  db.close();

  console.log("\nSeeding complete!");
}

function seedFromFixtures(db, fixtures) {
  const seeds = fixtures.database_seeds;
  if (!seeds) {
    console.warn("! No database_seeds in fixtures, using defaults");
    seedDefaults(db);
    return;
  }

  if (seeds.tasks) {
    const stmt = db.prepare(
      "INSERT OR IGNORE INTO tasks (task_id, type, status, created_at) VALUES (?, ?, ?, ?)"
    );
    let count = 0;
    for (const t of seeds.tasks) {
      stmt.run([t.task_id, t.type, t.status, t.created_at]);
      count++;
    }
    stmt.free();
    console.log(`+ Seeded ${count} tasks`);
  }

  if (seeds.events) {
    const stmt = db.prepare(
      "INSERT OR IGNORE INTO events (event_type, confidence, timestamp) VALUES (?, ?, ?)"
    );
    let count = 0;
    for (const e of seeds.events) {
      stmt.run([e.event_type, e.confidence, e.timestamp]);
      count++;
    }
    stmt.free();
    console.log(`+ Seeded ${count} events`);
  }
}

function seedDefaults(db) {
  const now = new Date().toISOString();
  try {
    db.run(
      "INSERT OR IGNORE INTO tasks (task_id, type, status, created_at) VALUES (?, ?, ?, ?)",
      ["default-001", "cli", "completed", now]
    );
    db.run(
      "INSERT OR IGNORE INTO events (event_type, confidence, timestamp) VALUES (?, ?, ?)",
      ["terminal_error", 0.9, now]
    );
    console.log("+ Default seed data inserted");
  } catch (e) {
    console.warn(`! Could not seed defaults: ${e.message}`);
  }
}

main().catch((err) => {
  console.error("Seeder failed:", err);
  process.exit(1);
});
