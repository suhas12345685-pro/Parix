// Standalone migrator — `npm run migrate` in CI / on a fresh DB.
import { makeDb } from "./db.js";

async function main() {
  const db = makeDb();
  await db.migrate();
  console.log(`[migrate] applied migrations on ${db.kind}`);
  await db.close();
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
