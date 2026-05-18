import { initDb, closeDb, getDb } from '../atrium/src/memory/db.js';
import { SynapseClient } from '../atrium/src/synapse/client.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '../data');
mkdirSync(DATA_DIR, { recursive: true });

async function test() {
  console.log('=== SYNAPSE ROUNDTRIP TEST ===\n');

  console.log('1. Initializing database...');
  await initDb(resolve(DATA_DIR, 'test-memory.db'));
  console.log('   OK\n');

  console.log('2. Connecting to Hands...');
  const synapse = new SynapseClient();

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);
    synapse.on('state_change', (status) => {
      if (status === 'CONNECTED') {
        clearTimeout(timeout);
        resolve();
      }
    });
    synapse.on('reboot_sync', () => {
      console.log('   Received REBOOT_SYNC from Hands');
    });
    synapse.connect();
  });
  console.log('   Connected! Status:', synapse.getStatus(), '\n');

  const python = process.platform === 'win32' ? 'python' : 'python3';
  console.log('3. Sending TASK_REQUEST (cli: python print)...');
  const start = Date.now();
  try {
    const result = await synapse.sendTask('cli', {
      argv: [python, '-c', 'print("hello from parix")'],
    });
    const elapsed = Date.now() - start;
    console.log('   TASK_RESULT received in', elapsed, 'ms');
    console.log('   Success:', result.success);
    console.log('   Output:', result.output.trim());
    console.log();

    if (elapsed < 500) {
      console.log('   PASS: Roundtrip < 500ms');
    } else {
      console.log('   WARN: Roundtrip >', elapsed, 'ms (target < 500ms)');
    }
  } catch (err: any) {
    console.error('   FAIL:', err.message);
  }

  console.log('\n4. Checking SQLite...');
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM tasks ORDER BY created_at DESC LIMIT 1');
  if (stmt.step()) {
    const cols = stmt.getColumnNames();
    const vals = stmt.get();
    const row: any = {};
    cols.forEach((c, i) => (row[c] = vals[i]));
    console.log('   Last task in DB:', JSON.stringify(row, null, 2));
    stmt.free();
  } else {
    console.log('   WARN: No tasks in database');
    stmt.free();
  }

  console.log('\n5. Cleanup...');
  synapse.disconnect();
  closeDb();
  console.log('   Done.\n');
  console.log('=== TEST COMPLETE ===');
}

test().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
