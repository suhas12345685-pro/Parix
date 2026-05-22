/**
 * PM2 Ecosystem - starts all Parix runtime processes.
 *
 * Ports are defined in shared/protocol.json:
 *   Hands Synapse: 8765
 *   Aegis relay:  8766
 *   Aegis UI:     3000
 */

const path = require('path');
const { spawnSync } = require('child_process');
const protocol = require('./shared/protocol.json');

const PARIX_HOME = process.env.PARIX_HOME || path.resolve(__dirname);
const ports = protocol.ports || {};
const AEGIS_UI_PORT = ports.aegis_ui || 3000;

function findPythonInterpreter() {
  const candidates =
    process.platform === 'win32'
      ? ['python', 'python3']
      : ['python3', 'python'];

  for (const candidate of candidates) {
    const result = spawnSync(candidate, ['--version'], { stdio: 'ignore' });
    if (!result.error && result.status === 0) return candidate;
  }

  return process.platform === 'win32' ? 'python' : 'python3';
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

module.exports = {
  apps: [
    {
      name: 'parix-hands',
      cwd: path.join(PARIX_HOME, 'hands'),
      script: 'main.py',
      interpreter: findPythonInterpreter(),
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      env: {
        PYTHONUNBUFFERED: '1',
        PARIX_HOME,
        PYTHONPATH: PARIX_HOME,
      },
      wait_ready: false,
    },

    {
      name: 'parix-atrium',
      cwd: path.join(PARIX_HOME, 'atrium'),
      script: 'dist/index.js',
      interpreter: 'node',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      kill_timeout: 3000,
      env: {
        NODE_ENV: 'production',
        PARIX_HOME,
      },
    },

    {
      name: 'parix-aegis',
      cwd: PARIX_HOME,
      script: 'hatchery/dist/index.js',
      args: '--serve-aegis',
      interpreter: 'node',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      env: {
        NODE_ENV: 'production',
        PARIX_HOME,
      },
    },
  ],
};
