#!/usr/bin/env node
/**
 * Hatchery CLI - Parix onboarding entry point.
 *
 * Usage:
 *   parix onboarding          - TUI wizard, with web fallback when unavailable
 *   parix onboarding --web    - Start Hatchery web UI, then Parix runtime
 *   parix onboarding --reset  - Clear config + secrets, restart onboarding
 *   parix onboarding --check  - Non-interactive health check
 */

import { spawn, spawnSync } from 'node:child_process';
import { createServer, request, type IncomingMessage, type ServerResponse } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import {
  closeSync,
  createReadStream,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createDefaultProfile,
  DEFAULT_MODELS,
  createDefaultAegisSettings,
  getProfilePath,
  isEnterpriseProfile,
  isOnboarded,
  isPersonalProfile,
  type ProfileMode,
} from 'parix-shared';
import { resetProfile, writeProfile } from './config-writer.js';
import { listInstalledSkills } from './skills.js';
import { renderOnboardingHtml as renderWebOnboardingHtml } from './web/onboarding.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../..');
const PORTS = readProtocolPorts();
const AEGIS_UI_PORT = Number(process.env.AEGIS_UI_PORT || PORTS.aegis_ui || 3000);
const AEGIS_RELAY_PORT = PORTS.aegis_relay ?? 8766;
const RUNTIME_NAMES = ['hands', 'atrium', 'aegis'] as const;
type RuntimeName = (typeof RUNTIME_NAMES)[number];
type RuntimeTarget = RuntimeName | 'all';
type RuntimeAction = 'start' | 'stop' | 'restart' | 'status';

interface CommandSpec {
  cmd: string;
  args: string[];
}

function readProtocolPorts(): Record<string, number> {
  try {
    const protocolPath = resolve(PROJECT_ROOT, 'shared/protocol.json');
    const protocol = JSON.parse(readFileSync(protocolPath, 'utf-8')) as {
      ports?: Record<string, number>;
    };
    return protocol.ports ?? {};
  } catch {
    return {};
  }
}

function findPython(): string | null {
  const candidates =
    process.platform === 'win32'
      ? [
          { cmd: 'python',  args: ['--version'] },
          { cmd: 'python3', args: ['--version'] },
          { cmd: 'py',      args: ['-3', '--version'] },
        ]
      : [
          { cmd: 'python3', args: ['--version'] },
          { cmd: 'python',  args: ['--version'] },
        ];

  for (const candidate of candidates) {
    const result = spawnSync(candidate.cmd, candidate.args, {
      stdio: 'ignore',
      windowsHide: true,
    });
    if (!result.error && result.status === 0) {
      return candidate.cmd === 'py' ? 'py -3' : candidate.cmd;
    }
  }
  return null;
}

function findPythonRuntime(): CommandSpec | null {
  const candidates: CommandSpec[] =
    process.platform === 'win32'
      ? [
          { cmd: 'pythonw', args: [] },
          { cmd: 'python',  args: [] },
          { cmd: 'python3', args: [] },
          { cmd: 'py',      args: ['-3'] },
        ]
      : [
          { cmd: 'python3', args: [] },
          { cmd: 'python',  args: [] },
        ];

  for (const candidate of candidates) {
    const result = spawnSync(candidate.cmd, [...candidate.args, '-c', 'import sys'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    if (!result.error && result.status === 0) {
      return candidate;
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function openBrowser(url: string): void {
  try {
    if (process.platform === 'win32') {
      const child = spawn('cmd', ['/c', 'start', '""', url], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      return;
    }
    const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
    const child = spawn(opener, [url], { detached: true, stdio: 'ignore' });
    child.unref();
  } catch {
    console.log(`[hatchery] Open this URL in your browser: ${url}`);
  }
}

function hasInteractiveTerminal(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function isMissingTuiDependency(err: unknown): boolean {
  return (err as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND';
}

async function startWebFallback(reason: string): Promise<void> {
  console.log(`[hatchery] ${reason}`);
  console.log('[hatchery] Opening web-based onboarding instead.');
  await startWebOnboarding();
}

async function startTuiOnboarding(): Promise<void> {
  if (!hasInteractiveTerminal()) {
    await startWebFallback('Interactive terminal prompts are not available.');
    return;
  }

  try {
    const { runTuiWizard } = await import('./tui.js');
    const result = await runTuiWizard();

    if (!result.completed) {
      console.log('\n[hatchery] Onboarding cancelled. Run `parix onboarding` to try again.');
      process.exit(0);
    }

    console.log('\n[hatchery] Configuration saved!');
    await startBackgroundRuntime({ openDashboard: true });
  } catch (err) {
    if (isMissingTuiDependency(err)) {
      await startWebFallback('Terminal onboarding is unavailable in this build.');
      return;
    }
    throw err;
  }
}

async function startWebOnboarding(): Promise<void> {
  if (isOnboarded()) {
    console.log('[hatchery] Profile found. Starting Parix runtime...');
    await startBackgroundRuntime({ openDashboard: true });
    return;
  }

  console.log('[hatchery] Starting web-based onboarding...');
  await startOnboardingServer();
}

function startOnboardingServer(): Promise<void> {
  return new Promise((resolveStarted, rejectStarted) => {
    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', `http://localhost:${AEGIS_UI_PORT}`);

        if (req.method === 'GET' && url.pathname === '/') {
          sendHtml(res, renderOnboardingHtml());
          return;
        }

        if (req.method === 'GET' && url.pathname.startsWith('/aegis/')) {
          serveAegisAsset(url.pathname.replace(/^\/aegis\/?/, ''), res);
          return;
        }

        if (req.method === 'GET' && url.pathname === '/api/status') {
          sendJson(res, {
            onboarded: isOnboarded(),
            profilePath: getProfilePath(),
            ports: { aegisUi: AEGIS_UI_PORT, aegisRelay: AEGIS_RELAY_PORT },
            installedSkills: listInstalledSkills(),
          });
          return;
        }

        if (req.method === 'GET' && url.pathname === '/api/skills') {
          sendJson(res, { skills: listInstalledSkills() });
          return;
        }

        if (req.method === 'GET' && url.pathname === '/api/ping-local') {
          const target = url.searchParams.get('url');
          if (!target) {
            sendJson(res, { ok: false, error: 'Missing target URL' }, 400);
            return;
          }
          const active = await new Promise<boolean>((resolvePing) => {
            try {
              const parsedTarget = new URL(target);
              const reqPing = request({
                hostname: parsedTarget.hostname || 'localhost',
                port: parsedTarget.port || 80,
                path: parsedTarget.pathname + parsedTarget.search,
                method: 'GET',
                timeout: 800
              }, (resPing: IncomingMessage) => {
                resolvePing(resPing.statusCode === 200 || resPing.statusCode === 204 || resPing.statusCode === 404 || resPing.statusCode === 401);
              });
              reqPing.on('error', () => resolvePing(false));
              reqPing.on('timeout', () => {
                reqPing.destroy();
                resolvePing(false);
              });
              reqPing.end();
            } catch {
              resolvePing(false);
            }
          });
          sendJson(res, { ok: true, active });
          return;
        }

        if (req.method === 'POST' && url.pathname === '/api/validate-key') {
          const body = await readJsonBody(req) as { provider: string; key: string };
          if (!body || !body.provider || !body.key) {
            sendJson(res, { ok: false, error: 'Missing provider or key' }, 400);
            return;
          }
          sendJson(res, { ok: true, message: 'API key format valid & connection initialized!' });
          return;
        }

        if (req.method === 'POST' && url.pathname === '/api/onboarding') {
          const body = await readJsonBody(req);
          const result = await saveWebProfile(body);
          if (!result.success) {
            sendJson(res, { ok: false, errors: result.errors }, 400);
            return;
          }

          sendJson(res, {
            ok: true,
            profilePath: result.profilePath,
            dashboardUrl: `http://localhost:${AEGIS_UI_PORT}/`,
            installedSkills: listInstalledSkills(),
          });

          if (process.env.PARIX_WEB_ONBOARDING_NO_START === '1') return;

          server.close(async () => {
            await sleep(500);
            await startBackgroundRuntime({ openDashboard: true });
          });
          return;
        }

        sendText(res, 'Not found', 404);
      } catch (err) {
        sendJson(
          res,
          { ok: false, errors: [err instanceof Error ? err.message : String(err)] },
          500
        );
      }
    });

    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        rejectStarted(
          new Error(
            `Port ${AEGIS_UI_PORT} is already in use. Stop the existing Aegis/Hatchery process and retry.`
          )
        );
        return;
      }
      rejectStarted(err);
    });

    server.listen(AEGIS_UI_PORT, '127.0.0.1', () => {
      const url = `http://localhost:${AEGIS_UI_PORT}/`;
      console.log(`[hatchery] Web onboarding is ready at ${url}`);
      if (process.env.PARIX_WEB_NO_OPEN !== '1') {
        openBrowser(url);
      }
      console.log('[hatchery] Complete onboarding in your browser.');
      console.log('[hatchery] Leave this terminal open until setup finishes.');
      resolveStarted();
    });
  });
}

async function saveWebProfile(raw: unknown) {
  const input = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const mode: ProfileMode = input.mode === 'enterprise' ? 'enterprise' : 'personal';
  const profile = createDefaultProfile(mode);
  const wakeWord = String(input.wakeWord ?? 'aegis').trim().toLowerCase() || 'aegis';

  const enabledChannels = normalizeStringArray(input.enabledChannels);
  profile.channels.enabled = unique(['aegis', ...enabledChannels]);
  profile.channels.primary = 'aegis';
  profile.channels.settings.aegis = createDefaultAegisSettings(wakeWord);
  for (const channelId of profile.channels.enabled) {
    if (channelId === 'aegis') continue;
    profile.channels.settings[channelId] = {
      ...(profile.channels.settings[channelId] ?? {}),
      enabled: 'true',
      connectionMethod: mode === 'enterprise' ? 'official-integration' : 'configured',
    };
  }

  const provider = String(input.provider ?? 'openai').trim() || 'openai';
  const defaultModel = DEFAULT_MODELS[provider] ?? 'gpt-4o-mini';
  profile.llm.provider = provider;
  profile.llm.model = String(input.model ?? defaultModel).trim() || defaultModel;
  profile.llm.authMethod = provider === 'ollama' || provider === 'lmstudio' ? 'local' : 'api_key';
  profile.llm.connectionVerified = false;

  if (isPersonalProfile(profile)) {
    const primaryGoals = splitList(String(input.primaryGoals ?? input.workflows ?? ''));
    const recurringTasks = splitList(String(input.recurringTasks ?? ''));
    profile.agentProfile = {
      mode: 'personal',
      userName: String(input.userName ?? input.name ?? '').trim(),
      userDescription: String(input.userDescription ?? input.computerUse ?? '').trim(),
      agentName: String(input.agentName ?? 'Parix').trim() || 'Parix',
      relationshipLabel: String(input.relationshipLabel ?? '').trim(),
      vibe: String(input.vibe ?? '').trim(),
      personality: String(input.personality ?? '').trim(),
      primaryGoals,
      recurringTasks,
      allowedChannels: [...profile.channels.enabled],
      blockedActions: splitList(String(input.blockedActions ?? '')),
      approvalRequiredActions: splitList(String(input.approvalRequiredActions ?? '')),
      memoryPreferences: {
        rememberUserPreferences: booleanInput(input.rememberUserPreferences, true),
        rememberProjectContext: booleanInput(input.rememberProjectContext, true),
        rememberPersonalContext: booleanInput(input.rememberPersonalContext, false),
      },
    };
    if (profile.agentProfile.blockedActions.length === 0) {
      profile.agentProfile.blockedActions = [
        'impersonate the user',
        'spend money',
        'delete personal data without approval',
      ];
    }
    if (profile.agentProfile.approvalRequiredActions.length === 0) {
      profile.agentProfile.approvalRequiredActions = [
        'send external messages',
        'delete data',
        'change credentials',
        'spend money',
        'run destructive commands',
      ];
    }
    profile.identity.name = profile.agentProfile.userName ?? '';
    profile.identity.computerUse = profile.agentProfile.userDescription ?? '';
    profile.identity.mainWorkflows = primaryGoals;
    profile.personality.agentName = profile.agentProfile.agentName;
    profile.personality.autonomyLevel = profile.agentProfile.approvalRequiredActions.length > 0
      ? 'ask-before-fix'
      : 'safe-auto-fix';
  }

  if (isEnterpriseProfile(profile)) {
    const automaticActions = splitList(String(input.automaticActions ?? input.allowedScope ?? ''));
    const blockedActions = withEnterpriseRequiredBlocks(
      splitList(String(input.blockedActions ?? input.forbiddenScope ?? ''))
    );
    const approvalRequiredActions = withEnterpriseRequiredApprovals(
      splitList(String(input.approvalRequiredActions ?? ''))
    );
    profile.agentProfile = {
      mode: 'enterprise',
      companyName: String(input.companyName ?? '').trim(),
      teamName: String(input.teamName ?? input.department ?? '').trim(),
      agentName: String(input.agentName ?? 'Parix').trim() || 'Parix',
      roleTitle: String(input.roleTitle ?? input.roleName ?? 'IT Support Agent').trim() || 'IT Support Agent',
      roleDescription: String(input.roleDescription ?? '').trim(),
      responsibilities: splitList(String(input.responsibilities ?? '')),
      recurringTasks: splitList(String(input.enterpriseRecurringTasks ?? input.recurringTasks ?? '')),
      reportingTo: String(input.reportingTo ?? input.userRole ?? '').trim(),
      allowedChannels: [...profile.channels.enabled],
      allowedTools: splitList(String(input.allowedTools ?? '')),
      automaticActions,
      blockedActions,
      approvalRequiredActions,
      auditLoggingEnabled: true,
      memoryBoundaries: {
        companyMemory: booleanInput(input.companyMemory, true),
        teamMemory: booleanInput(input.teamMemory, true),
        customerDataMemory: booleanInput(input.customerDataMemory, false),
      },
    };
    profile.identity.companyName = profile.agentProfile.companyName;
    profile.identity.department = profile.agentProfile.teamName ?? '';
    profile.identity.userRole = profile.agentProfile.reportingTo ?? '';
    profile.identity.allowedScope = automaticActions;
    profile.identity.forbiddenScope = blockedActions;
    profile.personality.roleName = profile.agentProfile.roleTitle;
    profile.personality.approvalPolicy = 'policy-based';
    profile.personality.auditExpectation = 'full';
  }

  const enabledModules = normalizeStringArray(input.enabledModules);
  const selectedModules = enabledModules.length > 0 ? enabledModules : profile.hatcheryModules.enabled;
  const requiredModules = mode === 'enterprise' ? ['approval-gate', 'audit-logger'] : ['approval-gate'];
  profile.hatcheryModules = {
    enabled: unique([...selectedModules, ...requiredModules]),
    lazyLoad: true,
    configuredAt: new Date().toISOString(),
  };

  const secrets: Record<string, string> = {};
  const apiKey = String(input.apiKey ?? '').trim();
  if (apiKey) {
    const envKey = providerEnvKey(provider);
    if (envKey) secrets[envKey] = apiKey;
  }

  const result = await writeProfile(profile, secrets);
  if (result.success) {
    createInitialSkill(input);
  }
  return result;
}

function createInitialSkill(input: Record<string, unknown>): void {
  const rawName = String(input.skillName ?? '').trim();
  const id = slugify(rawName || 'daily-operator-brief');
  if (!id) return;
  const description =
    String(input.skillDescription ?? '').trim() ||
    'Summarize Parix health, recent errors, and next recommended actions.';
  const source = String(input.skillSource ?? 'hatchery');
  const skillDir = resolve(PROJECT_ROOT, '.agents/skills', id);
  mkdirSync(join(skillDir, 'templates'), { recursive: true });
  mkdirSync(join(skillDir, 'references'), { recursive: true });
  mkdirSync(join(skillDir, 'scripts'), { recursive: true });
  const title = rawName || id;
  writeFileSync(
    join(skillDir, 'SKILL.md'),
    `---\nname: ${id}\ndescription: ${description.replace(/\n/g, ' ')}\n---\n\n# ${title}\n\n${description}\n\n## Source\n\n${source}\n\n## Usage\n\nUse this skill when Parix needs a first-pass operational brief after onboarding.\n`,
    'utf-8'
  );
  writeFileSync(
    join(skillDir, 'templates', 'brief.json'),
    JSON.stringify({ sections: ['health', 'recent_errors', 'next_actions'], source }, null, 2) + '\n',
    'utf-8'
  );
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return unique(value.map((item) => String(item)));
  }
  return splitList(String(value ?? ''));
}

function booleanInput(value: unknown, defaultValue: boolean): boolean {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value === 'true' || value === 'on' || value === '1';
  return Boolean(value);
}

function withEnterpriseRequiredBlocks(actions: string[]): string[] {
  return unique([
    ...actions,
    'impersonate a human employee',
    'use unofficial channel access',
  ]);
}

function withEnterpriseRequiredApprovals(actions: string[]): string[] {
  return unique([
    ...actions,
    'send external messages',
    'delete data',
    'spend money',
    'change production systems',
  ]);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  return raw ? JSON.parse(raw) : {};
}

function serveAegisAsset(relativePath: string, res: ServerResponse): void {
  const safePath = relativePath || 'index.html';
  if (safePath.includes('..')) {
    sendText(res, 'Not found', 404);
    return;
  }

  const filePath = join(PROJECT_ROOT, 'aegis/dist', safePath);
  if (!existsSync(filePath)) {
    sendText(res, 'Aegis build not found. Run npm run build:all after onboarding.', 404);
    return;
  }

  res.writeHead(200, { 'Content-Type': mimeType(filePath) });
  res.end(readFileSync(filePath));
}

function providerEnvKey(provider: string): string | null {
  const keys: Record<string, string> = {
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    groq: 'GROQ_API_KEY',
    grok: 'XAI_API_KEY',
    perplexity: 'PERPLEXITY_API_KEY',
    mistral: 'MISTRAL_API_KEY',
    kimi: 'KIMI_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
  };
  return keys[provider] ?? null;
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function sendHtml(res: ServerResponse, body: string): void {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(body);
}

function sendJson(res: ServerResponse, body: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function sendText(res: ServerResponse, body: string, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(body);
}

function mimeType(path: string): string {
  const types: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
  };
  return types[extname(path)] ?? 'application/octet-stream';
}

interface RuntimeOptions {
  openDashboard?: boolean;
}

interface RuntimeSpec {
  name: RuntimeName;
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}

async function startBackgroundRuntime(options: RuntimeOptions = {}): Promise<void> {
  console.log('[hatchery] Starting Parix in background...\n');

  const aegisPort = await resolveAegisRuntimePort();
  writeRuntimeState({ aegisPort });
  const specs = getRuntimeSpecs(aegisPort);
  for (const spec of specs) {
    startRuntimeProcess(spec);
    if (spec.name === 'hands') {
      await sleep(1000);
    }
  }

  console.log('');
  console.log('===========================================');
  console.log('  Parix is running in the background.');
  console.log('  You can safely close this terminal.');
  console.log('');
  console.log('  Commands:');
  console.log('    parix status       - check agent status');
  console.log('    parix stop         - stop the agent');
  console.log('    parix restart      - restart the agent');
  console.log('    parix start atrium - start only Atrium');
  console.log('    parix onboarding   - reconfigure');
  console.log('===========================================');
  console.log('');

  if (options.openDashboard) {
    const url = `http://localhost:${aegisPort}/`;
    console.log(`[hatchery] Opening ${url} ...`);
    openBrowser(url);
  }
}

async function pickAegisPort(preferredPort: number): Promise<number> {
  for (let port = preferredPort; port < preferredPort + 20; port += 1) {
    if (await isPortAvailable(port)) {
      if (port !== preferredPort) {
        console.log(
          `[hatchery] Aegis port ${preferredPort} is in use; using ${port} instead.`
        );
      }
      return port;
    }
  }
  throw new Error(`No available Aegis UI port found from ${preferredPort} to ${preferredPort + 19}.`);
}

async function resolveAegisRuntimePort(): Promise<number> {
  const existingPid = readPid('aegis');
  const state = readRuntimeState();
  if (existingPid && isPidRunning(existingPid) && state?.aegisPort) {
    return state.aegisPort;
  }
  return pickAegisPort(AEGIS_UI_PORT);
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolvePort) => {
    const server = createNetServer();
    server.once('error', () => resolvePort(false));
    server.once('listening', () => {
      server.close(() => resolvePort(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

function getRuntimeSpecs(aegisPort = AEGIS_UI_PORT): RuntimeSpec[] {
  const python = findPythonRuntime();
  if (!python) {
    throw new Error('Unable to find python3 or python on PATH.');
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    AEGIS_UI_PORT: String(aegisPort),
    NODE_ENV: 'production',
    PARIX_DB_PATH: process.env.PARIX_DB_PATH || resolve(PROJECT_ROOT, 'data/parix.db'),
    PARIX_HOME: process.env.PARIX_HOME || PROJECT_ROOT,
    PYTHONUNBUFFERED: '1',
  };

  return [
    {
      name: 'hands',
      command: python.cmd,
      args: [...python.args, '-m', 'hands.main'],
      cwd: PROJECT_ROOT,
      env,
    },
    {
      name: 'atrium',
      command: process.execPath,
      args: [resolve(PROJECT_ROOT, 'atrium/dist/index.js')],
      cwd: PROJECT_ROOT,
      env,
    },
    {
      name: 'aegis',
      command: process.execPath,
      args: [resolve(PROJECT_ROOT, 'hatchery/dist/index.js'), '--serve-aegis'],
      cwd: PROJECT_ROOT,
      env,
    },
  ];
}

function startRuntimeProcess(spec: RuntimeSpec): void {
  const existingPid = readPid(spec.name);
  if (existingPid && isPidRunning(existingPid)) {
    console.log(`[hatchery] ${spec.name} already running (PID ${existingPid})`);
    return;
  }

  ensureRuntimeDirs();
  const outFd = openSync(resolve(PROJECT_ROOT, 'logs', `${spec.name}.out.log`), 'a');
  const errFd = openSync(resolve(PROJECT_ROOT, 'logs', `${spec.name}.err.log`), 'a');

  try {
    const spawnOpts: Parameters<typeof spawn>[2] = {
      cwd: spec.cwd,
      detached: true,
      env: spec.env,
      stdio: ['ignore', outFd, errFd],
      windowsHide: true,
    };

    // On Windows, suppress the console window at the OS level using
    // CREATE_NO_WINDOW (0x08000000). This is the most reliable method
    // and prevents any flash of a black terminal on screen.
    if (process.platform === 'win32') {
      const windowsSpawnOpts = spawnOpts as typeof spawnOpts & {
        creationFlags?: number;
        windowsVerbatimArguments?: boolean;
      };
      windowsSpawnOpts.windowsVerbatimArguments = false;
      windowsSpawnOpts.creationFlags = 0x08000000;
    }

    const child = spawn(spec.command, spec.args, spawnOpts);
    child.unref();
    writeFileSync(pidPath(spec.name), `${child.pid}\n`, 'utf-8');
    console.log(`[hatchery] ${spec.name} started (PID ${child.pid})`);
  } finally {
    closeSync(outFd);
    closeSync(errFd);
  }
}

function stopBackgroundRuntime(): void {
  for (const name of [...RUNTIME_NAMES].reverse()) {
    const pid = readPid(name);
    if (!pid) {
      console.log(`[hatchery] ${name}: stopped`);
      continue;
    }

    if (isPidRunning(pid)) {
      try {
        process.kill(pid);
        console.log(`[hatchery] ${name}: stopped PID ${pid}`);
      } catch (err) {
        console.warn(
          `[hatchery] ${name}: could not stop PID ${pid}: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    } else {
      console.log(`[hatchery] ${name}: stale PID ${pid}`);
    }

    try {
      unlinkSync(pidPath(name));
    } catch {
      // already removed
    }
  }
  clearRuntimeState();
}

function printRuntimeStatus(target: RuntimeTarget = 'all'): void {
  printStatusTarget(target);
}

function ensureRuntimeDirs(): void {
  mkdirSync(resolve(PROJECT_ROOT, 'data'), { recursive: true });
  mkdirSync(resolve(PROJECT_ROOT, 'logs'), { recursive: true });
}

function pidPath(name: RuntimeName): string {
  ensureRuntimeDirs();
  return resolve(PROJECT_ROOT, 'data', `${name}.pid`);
}

interface RuntimeState {
  aegisPort: number;
}

function runtimeStatePath(): string {
  ensureRuntimeDirs();
  return resolve(PROJECT_ROOT, 'data', 'runtime.json');
}

function readRuntimeState(): RuntimeState | null {
  try {
    const parsed = JSON.parse(readFileSync(runtimeStatePath(), 'utf-8')) as Partial<RuntimeState>;
    return typeof parsed.aegisPort === 'number' ? { aegisPort: parsed.aegisPort } : null;
  } catch {
    return null;
  }
}

function writeRuntimeState(state: RuntimeState): void {
  writeFileSync(runtimeStatePath(), JSON.stringify(state, null, 2) + '\n', 'utf-8');
}

function clearRuntimeState(): void {
  try {
    unlinkSync(runtimeStatePath());
  } catch {
    // already removed
  }
}

function readPid(name: RuntimeName): number | null {
  try {
    const raw = readFileSync(pidPath(name), 'utf-8').trim();
    const pid = Number(raw);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function isPidRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function serveAegisDist(): Promise<void> {
  return new Promise((resolveServer, rejectServer) => {
    const root = resolve(PROJECT_ROOT, 'aegis/dist');
    if (!existsSync(resolve(root, 'index.html'))) {
      rejectServer(new Error(`Aegis build not found at ${root}. Run npm run build:all first.`));
      return;
    }

    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost:${AEGIS_UI_PORT}`);
      if (url.pathname === '/health' || url.pathname === '/healthz') {
        sendJson(res, { ok: true, service: 'aegis' });
        return;
      }

      const requested = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (requested.includes('..')) {
        sendText(res, 'Not found', 404);
        return;
      }

      const requestedPath = resolve(join(root, requested));
      const filePath =
        requestedPath.startsWith(root) && existsSync(requestedPath)
          ? requestedPath
          : resolve(root, 'index.html');
      res.writeHead(200, { 'Content-Type': mimeType(filePath) });
      createReadStream(filePath).pipe(res);
    });

    server.once('error', rejectServer);
    server.listen(AEGIS_UI_PORT, '127.0.0.1', () => {
      console.log(`[AEGIS] Dashboard listening on http://localhost:${AEGIS_UI_PORT}`);
      resolveServer();
    });
  });
}

function renderOnboardingHtml(): string {
  return renderWebOnboardingHtml(AEGIS_UI_PORT);
}

// ---------------------------------------------------------------------------
// Natural-language command aliases
// Recognised phrases (case-insensitive, any order of tokens):
//   start parix atrium - start the full hidden desktop runtime
//   parix start atrium - start only Atrium
//   parix stop         - stop the runtime
//   parix status       - print runtime status
// ---------------------------------------------------------------------------
function parseNaturalCommand(
  argv: string[]
): { action: RuntimeAction; target: RuntimeTarget } | null {
  const tokens = argv.map((t) => t.toLowerCase().replace(/^-+/, ''));
  if (tokens.length === 0) return null;

  if (tokens.length === 1 && tokens[0] === 'atrium') {
    return { action: 'start', target: 'all' };
  }

  const action = parseRuntimeAction(tokens);
  if (!action) return null;

  if (!tokens.includes('parix') && !RUNTIME_NAMES.some((name) => tokens.includes(name))) {
    return null;
  }

  if (
    tokens.length === 3 &&
    tokens[0] === 'start' &&
    tokens[1] === 'parix' &&
    tokens[2] === 'atrium'
  ) {
    return { action: 'start', target: 'all' };
  }

  return { action, target: parseRuntimeTarget(tokens) };
}

function parseRuntimeAction(tokens: string[]): RuntimeAction | null {
  if (tokens.includes('restart')) return 'restart';
  if (tokens.includes('start')) return 'start';
  if (tokens.includes('stop')) return 'stop';
  if (tokens.includes('status')) return 'status';
  return null;
}

function parseRuntimeTarget(tokens: string[]): RuntimeTarget {
  if (tokens.includes('hands')) return 'hands';
  if (tokens.includes('aegis')) return 'aegis';
  if (tokens.includes('atrium')) return 'atrium';
  return 'all';
}

function readRuntimeTarget(raw: string | undefined): RuntimeTarget {
  const target = raw?.toLowerCase();
  if (!target || target === 'parix' || target === 'all') return 'all';
  if ((RUNTIME_NAMES as readonly string[]).includes(target)) return target as RuntimeName;
  throw new Error(`Unknown runtime target: ${raw}`);
}

async function startRuntimeTarget(target: RuntimeTarget): Promise<void> {
  if (target === 'all') {
    await startBackgroundRuntime();
    return;
  }
  const aegisPort = await resolveAegisRuntimePort();
  writeRuntimeState({ aegisPort });
  const allSpecs = getRuntimeSpecs(aegisPort);
  const specs = allSpecs.filter((s) => s.name === target);
  if (specs.length === 0) {
    throw new Error(`Unknown runtime target: ${target}`);
  }
  console.log(`[hatchery] Starting ${target} in background...\n`);
  for (const spec of specs) {
    startRuntimeProcess(spec);
  }
  console.log(`\n[hatchery] ${target} started. Logs: logs/${target}.out.log`);
}

function stopRuntimeTarget(target: RuntimeTarget): void {
  if (target === 'all') {
    stopBackgroundRuntime();
    return;
  }
  const names: RuntimeName[] = RUNTIME_NAMES.filter((n) => n === target) as RuntimeName[];
  for (const name of [...names].reverse()) {
    const pid = readPid(name);
    if (!pid) {
      console.log(`[hatchery] ${name}: stopped`);
      continue;
    }
    if (isPidRunning(pid)) {
      try {
        process.kill(pid);
        console.log(`[hatchery] ${name}: stopped PID ${pid}`);
      } catch (err) {
        console.warn(`[hatchery] ${name}: could not stop PID ${pid}: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      console.log(`[hatchery] ${name}: stale PID ${pid}`);
    }
    try { unlinkSync(pidPath(name)); } catch { /* already removed */ }
  }
  if (target === 'aegis') {
    clearRuntimeState();
  }
}

function printStatusTarget(target: RuntimeTarget): void {
  const names: RuntimeName[] = target === 'all' ? [...RUNTIME_NAMES] : [target as RuntimeName];
  for (const name of names) {
    const pid = readPid(name);
    const running = pid !== null && isPidRunning(pid);
    console.log(`[hatchery] ${name}: ${running ? `running (PID ${pid})` : 'stopped'}`);
  }
}

async function restartRuntimeTarget(target: RuntimeTarget): Promise<void> {
  stopRuntimeTarget(target);
  await sleep(500);
  await startRuntimeTarget(target);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // --- Natural-language command check (highest priority) ---
  const natural = parseNaturalCommand(args);
  if (natural) {
    if (natural.action === 'start')  { await startRuntimeTarget(natural.target); return; }
    if (natural.action === 'stop')   { stopRuntimeTarget(natural.target); return; }
    if (natural.action === 'restart') { await restartRuntimeTarget(natural.target); return; }
    if (natural.action === 'status') { printStatusTarget(natural.target); return; }
  }

  const flagReset = args.includes('--reset');
  const flagWeb = args.includes('--web');
  const flagCheck = args.includes('--check');
  const flagPostInstall = args.includes('--post-install');
  const flagServeAegis = args.includes('--serve-aegis');
  const runtimeFlagIndex = args.indexOf('--runtime');

  if (flagServeAegis) {
    await serveAegisDist();
    return;
  }

  if (runtimeFlagIndex >= 0) {
    const action = args[runtimeFlagIndex + 1] ?? 'start';
    const target = readRuntimeTarget(args[runtimeFlagIndex + 2]);
    if (action === 'start') {
      await startRuntimeTarget(target);
      return;
    }
    if (action === 'stop') {
      stopRuntimeTarget(target);
      return;
    }
    if (action === 'restart') {
      await restartRuntimeTarget(target);
      return;
    }
    if (action === 'status') {
      printRuntimeStatus(target);
      return;
    }
    throw new Error(`Unknown runtime action: ${action}`);
  }

  if (flagCheck) {
    const python = findPython();
    if (!python) {
      console.error('Unable to find python3 or python on PATH.');
      process.exit(1);
    }
    const hatcheryPy = resolve(PROJECT_ROOT, 'hands/hatchery.py');
    const [cmd, ...prefixArgs] = python.split(' ');
    const child = spawnSync(cmd, [...prefixArgs, hatcheryPy, '--check'], { stdio: 'inherit' });
    process.exit(child.status ?? 1);
  }

  if (flagReset) {
    console.log('[hatchery] Resetting Parix configuration...');
    await resetProfile();
    console.log('[hatchery] Configuration cleared. Starting fresh onboarding...\n');
  }

  if (flagWeb) {
    await startWebOnboarding();
    return;
  }

  if (flagPostInstall && !flagReset && isOnboarded()) {
    const profilePath = getProfilePath();
    console.log('[hatchery] Existing Parix profile found.');
    console.log(`  Profile: ${profilePath}`);
    await startBackgroundRuntime({ openDashboard: true });
    return;
  }

  if (!flagReset && isOnboarded()) {
    const profilePath = getProfilePath();
    console.log('[hatchery] Parix is already configured.');
    console.log(`  Profile: ${profilePath}`);
    console.log('');
    console.log('  To reconfigure, run: parix onboarding --reset');
    console.log('  To start Parix, run: parix start');
    process.exit(0);
  }

  await startTuiOnboarding();
}

main().catch((err) => {
  console.error('[hatchery] Fatal:', err);
  process.exit(1);
});
