import WebSocket from 'ws';

const WS_URL = 'ws://localhost:8765';

async function testCouncil() {
  console.log('[TEST] Connecting to Hands as a second client to inject a sensor event...');

  const ws = new WebSocket(WS_URL);

  await new Promise<void>((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  console.log('[TEST] Connected. Waiting for REBOOT_SYNC...');

  await new Promise<void>((resolve) => {
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'REBOOT_SYNC') {
        console.log('[TEST] Got REBOOT_SYNC');
        resolve();
      }
    });
  });

  // Send a high-confidence sensor event that should trigger the Council
  const sensorEvent = {
    type: 'SENSOR_EVENT',
    event_type: 'terminal_error',
    data: { error: 'MODULE_NOT_FOUND', file: 'app.js' },
    confidence: 0.9,
    timestamp: Date.now() / 1000,
  };

  console.log('[TEST] Sending SENSOR_EVENT (terminal_error, MODULE_NOT_FOUND)...');
  ws.send(JSON.stringify(sensorEvent));

  // Also test a blocked command
  setTimeout(() => {
    const dangerousEvent = {
      type: 'SENSOR_EVENT',
      event_type: 'terminal_error',
      data: { error: 'permission denied', file: '/etc/shadow' },
      confidence: 0.95,
      timestamp: Date.now() / 1000,
    };
    console.log('[TEST] Sending SENSOR_EVENT (sensitive path /etc/shadow)...');
    ws.send(JSON.stringify(dangerousEvent));
  }, 3000);

  // Test low-confidence event (should be dropped)
  setTimeout(() => {
    const lowConfEvent = {
      type: 'SENSOR_EVENT',
      event_type: 'disk_space_low',
      data: {},
      confidence: 0.3,
      timestamp: Date.now() / 1000,
    };
    console.log('[TEST] Sending low-confidence SENSOR_EVENT (should be dropped)...');
    ws.send(JSON.stringify(lowConfEvent));
  }, 5000);

  // Wait and close
  setTimeout(() => {
    console.log('[TEST] Done. Closing connection.');
    ws.close();
    process.exit(0);
  }, 8000);
}

testCouncil().catch((err) => {
  console.error('[TEST] Failed:', err);
  process.exit(1);
});
