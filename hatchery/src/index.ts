#!/usr/bin/env node
/**
 * Hatchery CLI - Parix onboarding entry point.
 *
 * Usage:
 *   parix onboarding          - TUI wizard (default)
 *   parix onboarding --web    - Start Hatchery Web UI, then Parix runtime
 *   parix onboarding --reset  - Clear config + secrets, restart onboarding
 *   parix onboarding --check  - Non-interactive health check
 */

import { spawn, spawnSync } from 'node:child_process';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
const AEGIS_UI_PORT = PORTS.aegis_ui ?? 3000;
const AEGIS_RELAY_PORT = PORTS.aegis_relay ?? 8766;

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
          { cmd: 'py', args: ['-3', '--version'] },
          { cmd: 'python', args: ['--version'] },
          { cmd: 'python3', args: ['--version'] },
        ]
      : [
          { cmd: 'python3', args: ['--version'] },
          { cmd: 'python', args: ['--version'] },
        ];

  for (const candidate of candidates) {
    const result = spawnSync(candidate.cmd, candidate.args, { stdio: 'ignore' });
    if (!result.error && result.status === 0) {
      return candidate.cmd === 'py' ? 'py -3' : candidate.cmd;
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

async function startTuiOnboarding(): Promise<void> {
  try {
    const { runTuiWizard } = await import('./tui.js');
    const result = await runTuiWizard();

    if (!result.completed) {
      console.log('\n[hatchery] Onboarding cancelled. Run `parix onboarding` to try again.');
      process.exit(0);
    }

    console.log('\n[hatchery] Configuration saved!');
    await startBackgroundRuntime();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND') {
      console.log('[hatchery] TUI wizard not yet implemented.');
      console.log('[hatchery] Run with --web for web-based onboarding.');
      process.exit(1);
    }
    throw err;
  }
}

async function startWebOnboarding(): Promise<void> {
  if (isOnboarded()) {
    console.log('[hatchery] Profile found. Starting Parix runtime...');
    await startBackgroundRuntime({ savePm2: true });
    const url = `http://localhost:${AEGIS_UI_PORT}/`;
    console.log(`[hatchery] Opening ${url} ...`);
    openBrowser(url);
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
            await startBackgroundRuntime({ savePm2: true });
            const dashboardUrl = `http://localhost:${AEGIS_UI_PORT}/`;
            console.log(`[hatchery] Opening ${dashboardUrl} ...`);
            openBrowser(dashboardUrl);
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

async function startBackgroundRuntime(options: { savePm2?: boolean } = {}): Promise<void> {
  console.log('[hatchery] Starting Parix in background...\n');

  const pm2Result = spawnSync('npx', ['pm2', 'start', 'ecosystem.config.js', '--update-env'], {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    shell: true,
  });

  if (pm2Result.status !== 0) {
    console.error('[hatchery] PM2 start failed. Try manually: npm start');
    process.exit(1);
  }

  if (options.savePm2 !== false) {
    spawnSync('npx', ['pm2', 'save'], {
      cwd: PROJECT_ROOT,
      stdio: 'ignore',
      shell: true,
    });
  }

  console.log('');
  console.log('===========================================');
  console.log('  Parix is running in the background.');
  console.log('  You can safely close this terminal.');
  console.log('');
  console.log('  Commands:');
  console.log('    parix status     - check agent status');
  console.log('    parix stop       - stop the agent');
  console.log('    parix onboarding - reconfigure');
  console.log('===========================================');
  console.log('');
}

function renderOnboardingHtml(): string {
  return renderWebOnboardingHtml(AEGIS_UI_PORT);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flagReset = args.includes('--reset');
  const flagWeb = args.includes('--web');
  const flagCheck = args.includes('--check');

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
