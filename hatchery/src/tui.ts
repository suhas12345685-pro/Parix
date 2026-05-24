/**
 * TUI Wizard - interactive terminal onboarding for Parix.
 */

import { spawn } from 'node:child_process';
import inquirer from 'inquirer';
import {
  CHANNEL_IDS,
  DEFAULT_AEGIS_WAKE_WORD,
  createDefaultAegisSettings,
  DEFAULT_MODELS,
  HATCHERY_MODULES,
  LLM_PROVIDER_CAPABILITIES,
  LLM_PROVIDERS,
  PROVIDER_ENV_KEYS,
  createDefaultProfile,
  isEnterpriseProfile,
  isPersonalProfile,
  type LLMAuthMethod,
  type LLMAuthProfile,
  type LLMProviderCapability,
  type ParixProfile,
  type ProfileMode,
} from 'parix-shared';
import {
  createWorkspaceFilesystemMcpServer,
  getRequiredSecrets,
  normalizeMcpServerName,
  saveAuthProfile,
  type McpServerDeclaration,
  writeProfile,
  writeMcpServersConfig,
  writeIdentityFiles,
} from './config-writer.js';
import { formatInstalledSkillLines, listInstalledSkills } from './skills.js';

import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { request } from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../..');

// Premium ANSI escape colors
const cyan = (text: string) => `\x1b[36m${text}\x1b[0m`;
const green = (text: string) => `\x1b[32m${text}\x1b[0m`;
const yellow = (text: string) => `\x1b[33m${text}\x1b[0m`;
const magenta = (text: string) => `\x1b[35m${text}\x1b[0m`;
const red = (text: string) => `\x1b[31m${text}\x1b[0m`;
const bold = (text: string) => `\x1b[1m${text}\x1b[22m`;
const dim = (text: string) => `\x1b[2m${text}\x1b[22m`;

function checkLocalEndpoint(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const parsedUrl = new URL(url);
      const req = request(
        {
          hostname: parsedUrl.hostname || 'localhost',
          port: parsedUrl.port || 80,
          path: parsedUrl.pathname + parsedUrl.search,
          method: 'GET',
          timeout: 1000,
        },
        (res) => {
          resolve(
            res.statusCode === 200 ||
              res.statusCode === 204 ||
              res.statusCode === 404 ||
              res.statusCode === 401,
          );
        },
      );
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
      req.end();
    } catch {
      resolve(false);
    }
  });
}

// Real auth validation per provider. Prefer cheap, side-effect-free GET
// endpoints (list-models / key-info) that return 200 on a valid key and
// 401/403 on a bad one. Anthropic has no such GET, so we POST a 1-token
// message. Unknown providers fall back to a format/length check.
async function validateApiKey(
  provider: string,
  apiKey: string,
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const json = { 'Content-Type': 'application/json' };
    const bearer = (k: string) => ({ Authorization: `Bearer ${k}` });

    // GET endpoints keyed by provider id. {key} is substituted into the URL.
    const getEndpoints: Record<string, { url: string; headers: Record<string, string> }> = {
      openai: { url: 'https://api.openai.com/v1/models', headers: bearer(apiKey) },
      groq: { url: 'https://api.groq.com/openai/v1/models', headers: bearer(apiKey) },
      grok: { url: 'https://api.x.ai/v1/models', headers: bearer(apiKey) },
      kimi: { url: 'https://api.moonshot.ai/v1/models', headers: bearer(apiKey) },
      mistral: { url: 'https://api.mistral.ai/v1/models', headers: bearer(apiKey) },
      openrouter: { url: 'https://openrouter.ai/api/v1/key', headers: bearer(apiKey) },
      google: {
        url: `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
        headers: {},
      },
    };

    let res: Response;
    if (provider === 'anthropic') {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { ...json, 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        }),
        signal: controller.signal,
      });
    } else if (getEndpoints[provider]) {
      const ep = getEndpoints[provider];
      res = await fetch(ep.url, { method: 'GET', headers: ep.headers, signal: controller.signal });
    } else {
      clearTimeout(timer);
      return apiKey.trim().length > 5;
    }

    clearTimeout(timer);
    // 2xx = valid. 429 = rate-limited but key reachable/accepted → valid.
    // 401/403/4xx = bad/blocked key. 5xx/network → invalid (can't confirm).
    if (res.ok) return true;
    if (res.status === 429) return true;
    return false;
  } catch {
    return false;
  }
}

// Live channel credential validation — the same idea as validateApiKey, but
// per messaging channel. Returns {ok, detail}. Token channels do a cheap test
// API call; QR channels (WhatsApp) report "pairs on launch" (ready=green);
// channels we can't cheaply probe fall back to a presence check.
async function validateChannelCredential(
  channelId: string,
  secrets: Record<string, string>,
): Promise<{ ok: boolean; detail: string }> {
  const get = (k: string) => (secrets[k] || process.env[k] || '').trim();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  const f = (url: string, init?: RequestInit) =>
    fetch(url, { ...init, signal: controller.signal });
  try {
    switch (channelId) {
      case 'telegram': {
        const t = get('TELEGRAM_BOT_TOKEN');
        if (!t) return { ok: false, detail: 'no bot token' };
        const r = await f(`https://api.telegram.org/bot${t}/getMe`);
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; result?: { username?: string } };
        return j.ok ? { ok: true, detail: `@${j.result?.username ?? 'bot'}` } : { ok: false, detail: 'token rejected' };
      }
      case 'slack': {
        const t = get('SLACK_BOT_TOKEN');
        if (!t) return { ok: false, detail: 'no bot token' };
        const r = await f('https://slack.com/api/auth.test', {
          method: 'POST',
          headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; team?: string };
        return j.ok ? { ok: true, detail: j.team ?? 'workspace ok' } : { ok: false, detail: 'token rejected' };
      }
      case 'discord': {
        const t = get('DISCORD_BOT_TOKEN');
        if (!t) return { ok: false, detail: 'no bot token' };
        const r = await f('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bot ${t}` } });
        return r.status === 200 ? { ok: true, detail: 'bot ok' } : { ok: false, detail: `HTTP ${r.status}` };
      }
      case 'line': {
        const t = get('LINE_CHANNEL_ACCESS_TOKEN');
        if (!t) return { ok: false, detail: 'no access token' };
        const r = await f('https://api.line.me/v2/bot/info', { headers: { Authorization: `Bearer ${t}` } });
        return r.status === 200 ? { ok: true, detail: 'bot ok' } : { ok: false, detail: `HTTP ${r.status}` };
      }
      case 'mattermost': {
        const url = get('MATTERMOST_URL');
        const t = get('MATTERMOST_BOT_TOKEN');
        if (!url || !t) return { ok: false, detail: 'need url + token' };
        const r = await f(`${url.replace(/\/$/, '')}/api/v4/users/me`, { headers: { Authorization: `Bearer ${t}` } });
        return r.status === 200 ? { ok: true, detail: 'token ok' } : { ok: false, detail: `HTTP ${r.status}` };
      }
      case 'matrix': {
        const url = get('MATRIX_HOMESERVER_URL');
        const t = get('MATRIX_ACCESS_TOKEN');
        if (!url || !t) return { ok: false, detail: 'need homeserver + token' };
        const r = await f(`${url.replace(/\/$/, '')}/_matrix/client/v3/account/whoami`, {
          headers: { Authorization: `Bearer ${t}` },
        });
        return r.status === 200 ? { ok: true, detail: 'session ok' } : { ok: false, detail: `HTTP ${r.status}` };
      }
      // QR / device-link channels: green = configured, pairs on first launch.
      case 'whatsapp':
        return { ok: true, detail: 'QR pairing on first launch' };
      case 'signal':
        return { ok: true, detail: 'links via signal-cli on launch' };
      case 'imessage':
        return { ok: true, detail: 'bridge connects on launch' };
      default: {
        // Channels without a cheap probe: green if its required secrets exist.
        const has = Object.keys(secrets).some(
          (k) => k.toLowerCase().startsWith(channelId.toLowerCase()) && get(k),
        );
        return has
          ? { ok: true, detail: 'configured' }
          : { ok: false, detail: 'credentials not set' };
      }
    }
  } catch {
    return { ok: false, detail: 'unreachable / timeout' };
  } finally {
    clearTimeout(timer);
  }
}

export interface TuiResult {
  completed: boolean;
  profile?: ParixProfile;
  // How the user chose to launch ("hatch") after onboarding.
  hatchMode?: 'web' | 'tui';
}

const ACCOUNT_AUTH_URLS: Record<string, string> = {
  openai: 'https://chatgpt.com/auth/login',
  anthropic: 'https://claude.ai/login',
  groq: 'https://console.groq.com/login',
  grok: 'https://console.x.ai/',
  mistral: 'https://console.mistral.ai/',
  kimi: 'https://platform.moonshot.ai/console',
  openrouter: 'https://openrouter.ai/settings/keys',
};

export function getQuickProfile(mode: ProfileMode = 'personal'): ParixProfile {
  const profile = createDefaultProfile(mode);

  profile.llm.provider = 'mock';
  profile.llm.model = 'mock';
  profile.llm.authMethod = 'local';
  profile.llm.connectionVerified = true;
  profile.llm.verifiedAt = new Date().toISOString();

  profile.channels.enabled = ['aegis', 'console'];
  profile.channels.primary = 'aegis';
  profile.channels.settings.aegis = createDefaultAegisSettings('aegis');

  if (isPersonalProfile(profile)) {
    profile.agentProfile = {
      mode: 'personal',
      userName: 'Suhas',
      userDescription: 'Systems engineer & developer',
      agentName: 'Parix',
      relationshipLabel: 'personal agent',
      vibe: 'warm, direct, proactive',
      personality: 'friendly, capable, and candid',
      primaryGoals: [
        'monitor compilation errors',
        'suggest fixes',
        'draft changelogs',
      ],
      recurringTasks: ['check system health', 'verify build logs hourly'],
      techStack: 'TypeScript, Python, Node.js',
      proactivity: 'balanced',
      tone: 'friendly',
      mainMission: 'Optimize local development and system health monitoring.',
      allowedChannels: ['aegis', 'console'],
      blockedActions: [
        'impersonate the user',
        'spend money',
        'delete personal data without approval',
      ],
      approvalRequiredActions: [
        'send external messages',
        'delete data',
        'change credentials',
        'spend money',
        'run destructive commands',
      ],
      memoryPreferences: {
        rememberUserPreferences: true,
        rememberProjectContext: true,
        rememberPersonalContext: false,
      },
    };
    profile.identity.name = 'Suhas';
    profile.identity.computerUse = 'Systems engineer & developer';
    profile.identity.mainWorkflows = [
      'monitor compilation errors',
      'suggest fixes',
      'draft changelogs',
    ];
    profile.personality.agentName = 'Parix';
    profile.personality.autonomyLevel = 'ask-before-fix';
  } else if (isEnterpriseProfile(profile)) {
    profile.agentProfile = {
      mode: 'enterprise',
      companyName: 'Parix Corp',
      teamName: 'IT Operations',
      agentName: 'Parix',
      roleTitle: 'IT Support Agent',
      roleDescription:
        'Automated team member operating inside corporate bounds and code repos.',
      responsibilities: [
        'verify PR sanity',
        'scan dependencies',
        'monitor staging health',
      ],
      recurringTasks: ['hourly build checks', 'daily security scanning'],
      techStack: 'Cloud, Kubernetes, CI/CD',
      proactivity: 'balanced',
      tone: 'professional',
      mainMission: 'Enforce repository quality and automate ops workflows.',
      reportingTo: 'Ops Lead',
      allowedChannels: ['aegis', 'console'],
      allowedTools: ['Slack', 'Teams', 'GitHub', 'Jira', 'AWS'],
      automaticActions: ['local diagnostics', 'logs'],
      blockedActions: [
        'impersonate a human employee',
        'use unofficial channel access',
      ],
      approvalRequiredActions: [
        'send external messages',
        'delete data',
        'spend money',
        'change production systems',
      ],
      auditLoggingEnabled: true,
      memoryBoundaries: {
        companyMemory: true,
        teamMemory: true,
        customerDataMemory: false,
      },
    };
    profile.identity.companyName = 'Parix Corp';
    profile.identity.department = 'IT Operations';
    profile.identity.userRole = 'Ops Lead';
    profile.identity.allowedScope = ['local diagnostics', 'logs'];
    profile.identity.forbiddenScope = [
      'impersonate a human employee',
      'use unofficial channel access',
    ];
    profile.personality.roleName = 'IT Support Agent';
    profile.personality.approvalPolicy = 'policy-based';
    profile.personality.auditExpectation = 'full';
  }

  return profile;
}

function createDefaultInitialSkill(): void {
  const id = 'daily-operator-brief';
  const skillDir = resolve(PROJECT_ROOT, '.agents/skills', id);
  mkdirSync(join(skillDir, 'templates'), { recursive: true });
  mkdirSync(join(skillDir, 'references'), { recursive: true });
  mkdirSync(join(skillDir, 'scripts'), { recursive: true });

  writeFileSync(
    join(skillDir, 'SKILL.md'),
    `---\nname: ${id}\ndescription: Summarize Parix health, recent errors, and next recommended actions.\n---\n\n# Daily Operator Brief\n\nSummarize Parix health, recent errors, and next recommended actions.\n\n## Source\n\nhatchery\n\n## Usage\n\nUse this skill when Parix needs a first-pass operational brief after onboarding.\n`,
    'utf-8',
  );
  writeFileSync(
    join(skillDir, 'templates', 'brief.json'),
    JSON.stringify(
      {
        sections: ['health', 'recent_errors', 'next_actions'],
        source: 'hatchery',
      },
      null,
      2,
    ) + '\n',
    'utf-8',
  );
}

function createDefaultMcpServers(): Record<string, McpServerDeclaration> {
  return {
    filesystem: createWorkspaceFilesystemMcpServer(PROJECT_ROOT),
  };
}

async function collectMcpServers(): Promise<
  Record<string, McpServerDeclaration>
> {
  console.log('');
  console.log(bold(cyan('  MCP tool servers')));
  console.log(
    dim(
      '  Hatchery writes mcp.servers.json; Atrium connects the servers at boot and shows their tools in Aegis.',
    ),
  );
  console.log('');

  const { presets } = await inquirer.prompt<{ presets: string[] }>([
    {
      name: 'presets',
      type: 'checkbox',
      message: 'MCP servers to configure',
      choices: [
        {
          name: `Workspace filesystem (${PROJECT_ROOT})`,
          value: 'filesystem',
          checked: true,
        },
        { name: 'HTTP MCP server endpoint', value: 'http', checked: false },
        { name: 'Custom stdio MCP server', value: 'stdio', checked: false },
      ],
    },
  ]);

  const servers: Record<string, McpServerDeclaration> = {};
  if (presets.includes('filesystem')) {
    const { root } = await inquirer.prompt<{ root: string }>([
      {
        name: 'root',
        type: 'input',
        message: 'Filesystem MCP allowed root',
        default: PROJECT_ROOT,
      },
    ]);
    servers.filesystem = createWorkspaceFilesystemMcpServer(
      root || PROJECT_ROOT,
    );
  }

  if (presets.includes('http')) {
    const answers = await inquirer.prompt<{
      name: string;
      url: string;
      enabled: boolean;
    }>([
      {
        name: 'name',
        type: 'input',
        message: 'HTTP MCP server name',
        default: 'local-http',
      },
      {
        name: 'url',
        type: 'input',
        message: 'HTTP MCP endpoint URL',
        default: 'http://localhost:3333/mcp',
      },
      {
        name: 'enabled',
        type: 'confirm',
        message: 'Enable this HTTP MCP server now?',
        default: true,
      },
    ]);
    const name = normalizeMcpServerName(answers.name, 'local-http');
    servers[name] = {
      transport: 'http',
      url: answers.url.trim(),
      enabled: answers.enabled,
    };
  }

  if (presets.includes('stdio')) {
    const answers = await inquirer.prompt<{
      name: string;
      command: string;
      args: string;
      enabled: boolean;
    }>([
      {
        name: 'name',
        type: 'input',
        message: 'Stdio MCP server name',
        default: 'custom-stdio',
      },
      {
        name: 'command',
        type: 'input',
        message: 'Command',
        default: process.platform === 'win32' ? 'npx.cmd' : 'npx',
      },
      {
        name: 'args',
        type: 'input',
        message: 'Arguments',
        default: '-y @modelcontextprotocol/server-memory',
      },
      {
        name: 'enabled',
        type: 'confirm',
        message: 'Enable this stdio MCP server now?',
        default: true,
      },
    ]);
    const name = normalizeMcpServerName(answers.name, 'custom-stdio');
    servers[name] = {
      transport: 'stdio',
      command: answers.command.trim(),
      args: splitCommandArgs(answers.args),
      enabled: answers.enabled,
    };
  }

  return servers;
}

export async function runTuiWizard(): Promise<TuiResult> {
  console.log('');
  console.log(
    bold(
      cyan(`
  █▀▀█ █▀▀█ █▀▀█ ░▀░ █  █ 
  █▄▄█ █▄▄▀ █▄▄█ ▀█▀ ▀▄▄█ 
  █    ▀ ▀▀ ▀  ▀ ▀▀▀ ▄▄▄█   ${magenta('O N B O A R D I N G')}
  `),
    ),
  );
  console.log(
    cyan('  ┌────────────────────────────────────────────────────────┐'),
  );
  console.log(
    cyan('  │  Parix installation: starts all packages and repo code │'),
  );
  console.log(
    cyan('  │  Welcome to onboarding! Connect your local or cloud LLM│'),
  );
  console.log(
    cyan('  └────────────────────────────────────────────────────────┘'),
  );
  console.log('');
  console.log(bold(dim('  Installed skills:')));
  for (const line of formatInstalledSkillLines(listInstalledSkills())) {
    console.log(dim(`   ${line}`));
  }
  console.log('');

  // Greeting — the agent comes online and introduces the setup. Every
  // question is always asked (no quick/skip shortcut): we figure out the
  // vibe, who you are, and who I am.
  console.log('');
  console.log(bold(green('  ◇ Hey — I just came online. ')) + dim('Let me get to know us.'));
  console.log(dim("    We'll set my vibe, who you are, and who I am — then connect my brain, channels, and skills."));
  console.log('');

  const { mode } = await inquirer.prompt<{ mode: ProfileMode }>([
    {
      name: 'mode',
      type: 'list',
      message: 'Choose your Parix mode',
      choices: [
        { name: 'Personal', value: 'personal' },
        { name: 'Enterprise', value: 'enterprise' },
      ],
      default: 'personal',
    },
  ]);

  const profile = createDefaultProfile(mode);
  printModeIntro(mode);
  await collectAgentProfile(profile);
  const secrets: Record<string, string> = {};
  await collectLlm(profile, secrets);
  await collectMemoryStorage(profile);
  await collectChannels(profile, secrets);
  await collectSkills();
  await collectPermissions(profile);
  const mcpServers = await collectMcpServers();
  await collectHatcheryModules(profile);
  await collectTelemetry(profile);
  await collectAutonomy(profile);
  syncAgentProfileWithRuntime(profile);
  printOnboardingSummary(profile, mcpServers);

  const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
    {
      name: 'confirm',
      type: 'confirm',
      message: `Save this ${profile.mode} Parix profile?`,
      default: true,
    },
  ]);

  if (!confirm) return { completed: false };

  const result = await writeProfile(profile, secrets);
  if (!result.success) {
    console.error('[hatchery] Profile validation failed:');
    for (const error of result.errors) console.error(`  - ${error}`);
    return { completed: false };
  }

  console.log(`[hatchery] Profile saved: ${result.profilePath}`);
  const mcpResult = writeMcpServersConfig(mcpServers, PROJECT_ROOT);
  writeIdentityFiles(profile, PROJECT_ROOT);
  console.log(`[hatchery] MCP servers saved: ${mcpResult.path}`);
  const hatchMode = await collectHatchMethod();
  return { completed: true, profile, hatchMode };
}

function printModeIntro(mode: ProfileMode): void {
  console.log('');
  console.log(
    bold(cyan('  ┌─── PARIX INITIALIZING ────────────────────────────────┐')),
  );
  if (mode === 'personal') {
    console.log(
      cyan('  │  ✦ Mode: Personal Active                              │'),
    );
    console.log(
      dim("  │  Let's establish my virtual presence:                 │"),
    );
    console.log(
      dim('  │    - Who are you & what should I call you?            │'),
    );
    console.log(
      dim('  │    - What personality/vibe should I have?             │'),
    );
    console.log(
      dim('  │    - What daily tasks should I automate?              │'),
    );
    console.log(
      dim('  │    - What safety limits/blocked actions are set?      │'),
    );
  } else {
    console.log(
      cyan('  │  ✦ Mode: Enterprise Active                            │'),
    );
    console.log(
      dim('  │  Configuring co-worker context:                       │'),
    );
    console.log(
      dim('  │    - Company, department, and team structure          │'),
    );
    console.log(
      dim('  │    - Key responsibilities & recurring checks          │'),
    );
    console.log(
      dim('  │    - Safety boundaries & required approvals           │'),
    );
  }
  console.log(
    bold(cyan('  └───────────────────────────────────────────────────────┘')),
  );
  console.log('');
}

async function collectAgentProfile(profile: ParixProfile): Promise<void> {
  if (isPersonalProfile(profile)) {
    const answers = await inquirer.prompt<{
      userDescription: string;
      relationshipLabel: string;
      userName: string;
      agentName: string;
      vibe: string;
      personality: string;
      primaryGoals: string;
      recurringTasks: string;
      techStack: string;
      proactivity: 'reactive' | 'balanced' | 'proactive';
      tone: 'professional' | 'friendly' | 'candid' | 'philosophical';
      mainMission: string;
      blockedActions: string;
      approvalRequiredActions: string;
      rememberUserPreferences: boolean;
      rememberProjectContext: boolean;
      rememberPersonalContext: boolean;
    }>([
      {
        name: 'userDescription',
        type: 'input',
        message: 'Who are you?',
        default: '',
      },
      {
        name: 'relationshipLabel',
        type: 'input',
        message: 'Who am I to you?',
        default: 'personal agent',
      },
      {
        name: 'userName',
        type: 'input',
        message: 'What should I call you?',
        default: profile.agentProfile.userName ?? '',
      },
      {
        name: 'agentName',
        type: 'input',
        message: 'What should I call myself?',
        default: profile.agentProfile.agentName,
      },
      {
        name: 'vibe',
        type: 'input',
        message: 'What vibe should I have?',
        default: profile.agentProfile.vibe ?? 'warm, direct, proactive',
      },
      {
        name: 'personality',
        type: 'input',
        message: 'What personality should I have?',
        default:
          profile.agentProfile.personality ?? 'friendly, capable, and candid',
      },
      {
        name: 'primaryGoals',
        type: 'input',
        message: 'What should I help you with?',
        default: profile.agentProfile.primaryGoals.join(', '),
      },
      {
        name: 'recurringTasks',
        type: 'input',
        message: 'Recurring tasks I should remember',
        default: profile.agentProfile.recurringTasks.join(', '),
      },
      {
        name: 'techStack',
        type: 'input',
        message: 'What is your primary tech stack?',
        default: (profile.agentProfile as any).techStack || '',
      },
      {
        name: 'proactivity',
        type: 'list',
        message: 'How proactive should I be?',
        choices: [
          { name: 'Reactive (Only act when asked)', value: 'reactive' },
          { name: 'Balanced (Suggest fixes for errors)', value: 'balanced' },
          { name: 'Proactive (Suggest improvements automatically)', value: 'proactive' },
        ],
        default: (profile.agentProfile as any).proactivity || 'balanced',
      },
      {
        name: 'tone',
        type: 'list',
        message: 'What should my communication tone be?',
        choices: [
          { name: 'Professional & Concise', value: 'professional' },
          { name: 'Friendly & Collaborative', value: 'friendly' },
          { name: 'Candid & Direct', value: 'candid' },
          { name: 'Philosophical & Deep (OpenClaw style)', value: 'philosophical' },
        ],
        default: (profile.agentProfile as any).tone || 'friendly',
      },
      {
        name: 'mainMission',
        type: 'input',
        message: 'What is your main mission objective for me?',
        default: (profile.agentProfile as any).mainMission || '',
      },
      {
        name: 'blockedActions',
        type: 'input',
        message: 'What should I never do?',
        default: profile.agentProfile.blockedActions.join(', '),
      },
      {
        name: 'approvalRequiredActions',
        type: 'input',
        message: 'What should require approval?',
        default: profile.agentProfile.approvalRequiredActions.join(', '),
      },
      {
        name: 'rememberUserPreferences',
        type: 'confirm',
        message: 'Remember your preferences?',
        default: profile.agentProfile.memoryPreferences.rememberUserPreferences,
      },
      {
        name: 'rememberProjectContext',
        type: 'confirm',
        message: 'Remember project context?',
        default: profile.agentProfile.memoryPreferences.rememberProjectContext,
      },
      {
        name: 'rememberPersonalContext',
        type: 'confirm',
        message: 'Remember personal context?',
        default: profile.agentProfile.memoryPreferences.rememberPersonalContext,
      },
    ]);

    profile.agentProfile = {
      mode: 'personal',
      userName: answers.userName.trim(),
      userDescription: answers.userDescription.trim(),
      agentName: answers.agentName.trim() || 'Parix',
      relationshipLabel: answers.relationshipLabel.trim(),
      vibe: answers.vibe.trim(),
      personality: answers.personality.trim(),
      primaryGoals: splitList(answers.primaryGoals),
      recurringTasks: splitList(answers.recurringTasks),
      techStack: answers.techStack.trim(),
      proactivity: answers.proactivity,
      tone: answers.tone,
      mainMission: answers.mainMission.trim(),
      allowedChannels: [...profile.channels.enabled],
      blockedActions: splitList(answers.blockedActions),
      approvalRequiredActions: splitList(answers.approvalRequiredActions),
      memoryPreferences: {
        rememberUserPreferences: answers.rememberUserPreferences,
        rememberProjectContext: answers.rememberProjectContext,
        rememberPersonalContext: answers.rememberPersonalContext,
      },
    };
    profile.identity.name = answers.userName.trim();
    profile.identity.computerUse = answers.userDescription.trim();
    profile.identity.mainWorkflows = splitList(answers.primaryGoals);
    profile.personality.agentName = profile.agentProfile.agentName;
    return;
  }

  if (isEnterpriseProfile(profile)) {
    const answers = await inquirer.prompt<{
      companyName: string;
      teamName: string;
      agentName: string;
      roleTitle: string;
      roleDescription: string;
      responsibilities: string;
      recurringTasks: string;
      techStack: string;
      proactivity: 'reactive' | 'balanced' | 'proactive';
      tone: 'professional' | 'friendly' | 'candid' | 'philosophical';
      mainMission: string;
      allowedTools: string;
      reportingTo: string;
      automaticActions: string;
      approvalRequiredActions: string;
      blockedActions: string;
      companyMemory: boolean;
      teamMemory: boolean;
      customerDataMemory: boolean;
    }>([
      {
        name: 'companyName',
        type: 'input',
        message: 'Company name',
        default: profile.agentProfile.companyName,
      },
      {
        name: 'teamName',
        type: 'input',
        message: 'Team name',
        default: profile.agentProfile.teamName ?? '',
      },
      {
        name: 'agentName',
        type: 'input',
        message: 'Agent name',
        default: profile.agentProfile.agentName,
      },
      {
        name: 'roleTitle',
        type: 'input',
        message: 'Agent role',
        default: profile.agentProfile.roleTitle,
      },
      {
        name: 'roleDescription',
        type: 'input',
        message: 'Role description',
        default: profile.agentProfile.roleDescription,
      },
      {
        name: 'responsibilities',
        type: 'input',
        message: 'Responsibilities',
        default: profile.agentProfile.responsibilities.join(', '),
      },
      {
        name: 'recurringTasks',
        type: 'input',
        message: 'Recurring tasks',
        default: profile.agentProfile.recurringTasks.join(', '),
      },
      {
        name: 'techStack',
        type: 'input',
        message: 'What is the team primary tech stack?',
        default: (profile.agentProfile as any).techStack || '',
      },
      {
        name: 'proactivity',
        type: 'list',
        message: 'How proactive should I be?',
        choices: [
          { name: 'Reactive (Only act when asked)', value: 'reactive' },
          { name: 'Balanced (Suggest fixes for errors)', value: 'balanced' },
          { name: 'Proactive (Suggest improvements automatically)', value: 'proactive' },
        ],
        default: (profile.agentProfile as any).proactivity || 'balanced',
      },
      {
        name: 'tone',
        type: 'list',
        message: 'What should my communication tone be?',
        choices: [
          { name: 'Professional & Concise', value: 'professional' },
          { name: 'Friendly & Collaborative', value: 'friendly' },
          { name: 'Candid & Direct', value: 'candid' },
          { name: 'Philosophical & Deep (OpenClaw style)', value: 'philosophical' },
        ],
        default: (profile.agentProfile as any).tone || 'friendly',
      },
      {
        name: 'mainMission',
        type: 'input',
        message: 'What is your main mission objective for me?',
        default: (profile.agentProfile as any).mainMission || '',
      },
      {
        name: 'allowedTools',
        type: 'input',
        message: 'Tools to join through official integrations',
        default:
          profile.agentProfile.allowedTools.join(', ') ||
          'Slack, Teams, Gmail, GitHub, CRM',
      },
      {
        name: 'reportingTo',
        type: 'input',
        message: 'Who does the agent report to?',
        default: profile.agentProfile.reportingTo ?? '',
      },
      {
        name: 'automaticActions',
        type: 'input',
        message: 'What can the agent do automatically?',
        default: profile.agentProfile.automaticActions.join(', '),
      },
      {
        name: 'approvalRequiredActions',
        type: 'input',
        message: 'What needs human approval?',
        default: profile.agentProfile.approvalRequiredActions.join(', '),
      },
      {
        name: 'blockedActions',
        type: 'input',
        message: 'What must the agent never do?',
        default: profile.agentProfile.blockedActions.join(', '),
      },
      {
        name: 'companyMemory',
        type: 'confirm',
        message: 'Allow company memory?',
        default: profile.agentProfile.memoryBoundaries.companyMemory,
      },
      {
        name: 'teamMemory',
        type: 'confirm',
        message: 'Allow team memory?',
        default: profile.agentProfile.memoryBoundaries.teamMemory,
      },
      {
        name: 'customerDataMemory',
        type: 'confirm',
        message: 'Allow customer data memory?',
        default: profile.agentProfile.memoryBoundaries.customerDataMemory,
      },
    ]);

    profile.agentProfile = {
      mode: 'enterprise',
      companyName: answers.companyName.trim(),
      teamName: answers.teamName.trim(),
      agentName: answers.agentName.trim() || 'Parix',
      roleTitle: answers.roleTitle.trim() || 'Digital Co-worker',
      roleDescription: answers.roleDescription.trim(),
      responsibilities: splitList(answers.responsibilities),
      recurringTasks: splitList(answers.recurringTasks),
      techStack: answers.techStack.trim(),
      proactivity: answers.proactivity,
      tone: answers.tone,
      mainMission: answers.mainMission.trim(),
      reportingTo: answers.reportingTo.trim(),
      allowedChannels: [...profile.channels.enabled],
      allowedTools: splitList(answers.allowedTools),
      automaticActions: splitList(answers.automaticActions),
      blockedActions: withEnterpriseRequiredBlocks(
        splitList(answers.blockedActions),
      ),
      approvalRequiredActions: withEnterpriseRequiredApprovals(
        splitList(answers.approvalRequiredActions),
      ),
      auditLoggingEnabled: true,
      memoryBoundaries: {
        companyMemory: answers.companyMemory,
        teamMemory: answers.teamMemory,
        customerDataMemory: answers.customerDataMemory,
      },
    };
    profile.identity.companyName = profile.agentProfile.companyName;
    profile.identity.department = profile.agentProfile.teamName ?? '';
    profile.identity.userRole = profile.agentProfile.reportingTo ?? '';
    profile.identity.allowedScope = profile.agentProfile.automaticActions;
    profile.identity.forbiddenScope = profile.agentProfile.blockedActions;
    profile.personality.roleName = profile.agentProfile.roleTitle;
    profile.personality.approvalPolicy = 'policy-based';
    profile.personality.auditExpectation = 'full';
  }
}

async function collectIdentity(profile: ParixProfile): Promise<void> {
  if (isPersonalProfile(profile)) {
    const answers = await inquirer.prompt<{
      name: string;
      computerUse: string;
      mainWorkflows: string;
    }>([
      { name: 'name', type: 'input', message: 'Your name', default: '' },
      {
        name: 'computerUse',
        type: 'input',
        message: 'What do you mostly use this computer for?',
        default: 'coding, browsing, documents',
      },
      {
        name: 'mainWorkflows',
        type: 'input',
        message: 'Main workflows Parix should understand',
        default: 'development, troubleshooting',
      },
    ]);
    profile.identity.name = answers.name;
    profile.identity.computerUse = answers.computerUse;
    profile.identity.mainWorkflows = splitList(answers.mainWorkflows);
    return;
  }

  if (isEnterpriseProfile(profile)) {
    const answers = await inquirer.prompt<{
      companyName: string;
      industry: string;
      department: string;
      userRole: string;
      allowedScope: string;
      forbiddenScope: string;
    }>([
      {
        name: 'companyName',
        type: 'input',
        message: 'Company name',
        default: '',
      },
      { name: 'industry', type: 'input', message: 'Industry', default: '' },
      {
        name: 'department',
        type: 'input',
        message: 'Department',
        default: 'IT',
      },
      { name: 'userRole', type: 'input', message: 'Your role', default: '' },
      {
        name: 'allowedScope',
        type: 'input',
        message: 'Allowed automation scope',
        default: 'local diagnostics, logs',
      },
      {
        name: 'forbiddenScope',
        type: 'input',
        message: 'Forbidden scope',
        default: 'production deploys, billing changes',
      },
    ]);
    profile.identity.companyName = answers.companyName;
    profile.identity.industry = answers.industry;
    profile.identity.department = answers.department;
    profile.identity.userRole = answers.userRole;
    profile.identity.allowedScope = splitList(answers.allowedScope);
    profile.identity.forbiddenScope = splitList(answers.forbiddenScope);
  }
}

async function collectLlm(
  profile: ParixProfile,
  secrets: Record<string, string>,
): Promise<void> {
  const { provider } = await inquirer.prompt<{ provider: string }>([
    {
      name: 'provider',
      type: 'list',
      message: 'Choose your default LLM provider',
      choices: LLM_PROVIDERS.map((id) => ({
        name: LLM_PROVIDER_CAPABILITIES[id]?.name ?? id,
        value: id,
      })),
      default: profile.llm.provider,
    },
  ]);

  const capability = capabilityFor(provider);
  const authMethod = await chooseAuthMethod(capability, provider);
  const defaultModel = '';
  const { model } = await inquirer.prompt<{ model: string }>([
    {
      name: 'model',
      type: 'input',
      message: 'Default model',
      default: (DEFAULT_MODELS[provider] ?? profile.llm.model) || '',
    },
  ]);

  const providerForModels = profile.llm.provider as string;
  const modelPresets: Record<string, string[]> = {
    openai: ["gpt-4o-mini", "gpt-4o", "o1-mini", "o1-preview"],
    anthropic: ["claude-3-5-sonnet-20240620", "claude-3-opus-20240229", "claude-3-haiku-20240307"],
    groq: ["llama-3.1-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
    google: ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-1.0-pro"],
    ollama: ["llama3.2", "mistral", "gemma2", "phi3"],
  };

  const presets = modelPresets[providerForModels] || [];
  let modelChoices = presets.map(m => ({ name: m, value: m }));
  modelChoices.push({ name: 'Enter custom model name...', value: '__custom__' });

  let finalModel = defaultModel;

  if (presets.length > 0 && authMethod === 'api_key') {
    const { modelSelection } = await inquirer.prompt<{ modelSelection: string }>([
      {
        name: 'modelSelection',
        type: 'list',
        message: `Choose a model for ${providerForModels}`,
        choices: modelChoices,
        default: defaultModel,
      },
    ]);

    if (modelSelection === '__custom__') {
      const { customModel } = await inquirer.prompt<{ customModel: string }>([
        {
          name: 'customModel',
          type: 'input',
          message: 'Enter custom model name',
          default: defaultModel,
        },
      ]);
      finalModel = customModel;
    } else {
      finalModel = modelSelection;
    }
  } else {
    const { modelInput } = await inquirer.prompt<{ modelInput: string }>([
      {
        name: 'modelInput',
        type: 'input',
        message: 'Default model',
        default: defaultModel,
      },
    ]);
    finalModel = modelInput;
  }

  profile.llm.provider = provider;
  profile.llm.model = finalModel.trim() || defaultModel;
  profile.llm.authMethod = authMethod;
  profile.llm.authProfileId = null;
  profile.llm.connectionVerified = authMethod === 'local';
  profile.llm.verifiedAt =
    authMethod === 'local' ? new Date().toISOString() : null;

  if (authMethod === 'local') {
    const envKey = PROVIDER_ENV_KEYS[provider];
    if (envKey) {
      const defaultEndpoint =
        provider === 'ollama'
          ? 'http://localhost:11434'
          : 'http://localhost:1234/v1';
      const checkUrl =
        provider === 'ollama'
          ? 'http://localhost:11434'
          : 'http://localhost:1234';

      let valid = false;
      while (!valid) {
        console.log(dim(`  Probing local server at ${checkUrl}...`));
        const active = await checkLocalEndpoint(checkUrl);
        if (active) {
          console.log(green(`  ✔ Connection is working! Valid, proceed.`));
          valid = true;
          secrets[envKey] = defaultEndpoint;
        } else {
          console.log(red(`  ✘ Connection failed! Offline or unreachable.`));
          const { action } = await inquirer.prompt<{
            action: 'retry' | 'custom' | 'ignore';
          }>([
            {
              name: 'action',
              type: 'list',
              message:
                'Local server connection failed. What would you like to do?',
              choices: [
                {
                  name: '1. Try again (make sure Ollama/LM Studio is running)',
                  value: 'retry',
                },
                {
                  name: '2. Enter different local endpoint URL',
                  value: 'custom',
                },
                { name: '3. Ignore and proceed anyway', value: 'ignore' },
              ],
              default: 'retry',
            },
          ]);

          if (action === 'ignore') {
            secrets[envKey] = defaultEndpoint;
            break;
          } else if (action === 'custom') {
            const { baseUrl } = await inquirer.prompt<{ baseUrl: string }>([
              {
                name: 'baseUrl',
                type: 'input',
                message: `${capability.name} local endpoint`,
                default: defaultEndpoint,
              },
            ]);
            secrets[envKey] = baseUrl;
            try {
              const parsed = new URL(baseUrl);
              const activeCustom = await checkLocalEndpoint(
                `${parsed.protocol}//${parsed.host}`,
              );
              if (activeCustom) {
                console.log(
                  green(`  ✔ Connection is working! Valid, proceed.`),
                );
                valid = true;
              } else {
                console.log(
                  red(`  ✘ Connection failed! Offline or unreachable.`),
                );
              }
            } catch {
              console.log(red(`  ✘ Invalid URL format!`));
            }
          }
        }
      }
    }
    return;
  }

  if (authMethod === 'api_key') {
    const envKey = PROVIDER_ENV_KEYS[provider];
    if (envKey) {
      let valid = false;
      while (!valid) {
        const { apiKey } = await inquirer.prompt<{ apiKey: string }>([
          {
            name: 'apiKey',
            type: envKey.endsWith('_URL') ? 'input' : 'password',
            message: envKey.endsWith('_URL')
              ? `${provider} local/base URL`
              : `${provider} API key (Auto-detect active)`,
            mask: '*',
          },
        ]);

        if (!apiKey) {
          console.log(yellow('  ⚠ API Key is required.'));
          continue;
        }

        // Auto-detection logic
        if (apiKey.startsWith('sk-ant-') && provider !== 'anthropic') {
          console.log(yellow(`\n  ✦ Auto-detected Anthropic key. Switching provider...`));
          profile.llm.provider = 'anthropic';
        } else if (apiKey.startsWith('gsk_') && provider !== 'groq') {
          console.log(yellow(`\n  ✦ Auto-detected Groq key. Switching provider...`));
          profile.llm.provider = 'groq';
        } else if (apiKey.startsWith('AIza') && provider !== 'google') {
          console.log(yellow(`\n  ✦ Auto-detected Google Gemini key. Switching provider...`));
          profile.llm.provider = 'google';
        }

        console.log(dim('  Validating API connection...'));
        const working = await validateApiKey(provider, apiKey);
        if (working) {
          console.log(green(`  ✔ Connection is working! Valid, proceed.`));
          secrets[envKey] = apiKey;
          valid = true;
        } else {
          console.log(
            red(`  ✘ Connection failed! Invalid key or network timeout.`),
          );
          const { action } = await inquirer.prompt<{
            action: 'retry' | 'ignore';
          }>([
            {
              name: 'action',
              type: 'list',
              message: 'API validation failed. What would you like to do?',
              choices: [
                { name: '1. Re-enter API Key', value: 'retry' },
                { name: '2. Ignore and proceed anyway', value: 'ignore' },
              ],
              default: 'retry',
            },
          ]);
          if (action === 'ignore') {
            secrets[envKey] = apiKey;
            break;
          }
        }
      }
    }
    return;
  }

  if (authMethod === 'account_auth') {
    const profileId = `${provider}:account:default`;
    const authProfile = await runAccountAuth(provider, capability, profileId);
    profile.llm.authProfileId = authProfile.id;
  }
}

async function checkCliPresence(provider: string): Promise<boolean> {
  const { execSync } = await import('node:child_process');
  let cmd = '';
  if (provider === 'openai') cmd = 'openai --version';
  if (provider === 'anthropic') cmd = 'anthropic --version';
  if (provider === 'google') cmd = 'gcloud --version';
  if (!cmd) return false;
  try {
    execSync(process.platform === 'win32' ? cmd.replace('openai', 'openai.cmd').replace('anthropic', 'anthropic.cmd') : cmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function chooseAuthMethod(
  capability: LLMProviderCapability,
  provider: string,
): Promise<LLMAuthMethod> {
  if (capability.supportedAuthMethods.length === 1) {
    return capability.supportedAuthMethods[0];
  }

  const cliActive = await checkCliPresence(provider);

  const { authMethod } = await inquirer.prompt<{ authMethod: LLMAuthMethod }>([
    {
      name: 'authMethod',
      type: 'list',
      message: `Connect \${capability.name} using`,
      choices: capability.supportedAuthMethods.map((method) => {
        let label = labelAuthMethod(method, capability);
        if (method === 'account_auth' && cliActive) {
          label += green(' (CLI detected & ready)');
        }
        return {
          name: label,
          value: method,
        };
      }),
      default: capability.defaultAuthMethod,
    },
  ]);
  return authMethod;
}

async function runAccountAuth(
  provider: string,
  capability: LLMProviderCapability,
  profileId: string,
): Promise<LLMAuthProfile> {
  const authUrl = ACCOUNT_AUTH_URLS[provider];

  console.log('');
  console.log(
    capability.accountAuthInstructions ??
      `Use your ${capability.name} account auth flow.`,
  );
  if (authUrl) {
    console.log(`[hatchery] Opening ${authUrl}`);
    openBrowser(authUrl);
  }

  const { accountLabel, pastedToken, configured } = await inquirer.prompt<{
    accountLabel: string;
    pastedToken: string;
    configured: boolean;
  }>([
    {
      name: 'accountLabel',
      type: 'input',
      message: 'Account label for this auth profile',
      default: `${capability.name} account`,
    },
    {
      name: 'pastedToken',
      type: 'password',
      message:
        'Optional access token/session token if the provider flow gave you one',
      mask: '*',
    },
    {
      name: 'configured',
      type: 'confirm',
      message: 'Mark this account-auth profile as ready?',
      default: true,
    },
  ]);

  const now = new Date().toISOString();
  const secretRef = `${provider.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_ACCOUNT_AUTH_TOKEN`;
  const authProfile: LLMAuthProfile = {
    id: profileId,
    provider,
    method: 'account_auth',
    status: configured ? 'configured' : 'pending',
    label: capability.accountAuthLabel ?? `${capability.name} account auth`,
    accountLabel,
    secretRef: pastedToken ? secretRef : undefined,
    instructions: capability.accountAuthInstructions,
    createdAt: now,
    updatedAt: now,
  };

  return saveAuthProfile(authProfile, pastedToken || undefined);
}

// Write a KEY=value to ~/.parix/.env (upsert). Used for non-secret runtime
// config (e.g. memory backend) that the agent reads from the environment.
function upsertEnvVar(key: string, value: string): void {
  const parixHome =
    process.env.PARIX_HOME || resolve(homedir(), '.parix');
  const envPath = resolve(parixHome, '.env');
  mkdirSync(parixHome, { recursive: true });
  let lines: string[] = [];
  if (existsSync(envPath)) {
    lines = readFileSync(envPath, 'utf-8').split('\n');
  }
  const idx = lines.findIndex((l) => l.trim().startsWith(`${key}=`));
  const entry = `${key}=${value}`;
  if (idx >= 0) lines[idx] = entry;
  else lines.push(entry);
  writeFileSync(envPath, lines.join('\n').replace(/\n+$/, '') + '\n', 'utf-8');
}

// "Where do you want to store your memory?" — local / cloud / hybrid, with a
// cloud-provider picker for cloud|hybrid. Writes MEMORY_STORAGE_MODE and
// MEMORY_BACKEND to ~/.parix/.env (read by hands/memory/cloud_sync.py).
const SKIP = '__skip__';
async function collectMemoryStorage(
  _profile: ParixProfile,
): Promise<void> {
  console.log('');
  const dot = green('●');
  const { mode } = await inquirer.prompt<{ mode: string }>([
    {
      name: 'mode',
      type: 'list',
      message: yellow('Where do you want to store your memory?'),
      choices: [
        { name: `${dot} Local only — stays on this machine`, value: 'local' },
        { name: `${dot} Cloud — all memory synced to a cloud provider`, value: 'cloud' },
        { name: `${dot} Hybrid — sensitive stays local, the rest goes to cloud`, value: 'hybrid' },
        { name: dim('Skip for now'), value: SKIP },
      ],
      default: 'local',
    },
  ]);

  if (mode === SKIP) {
    console.log(dim('  ↪ Skipped — defaulting to local memory.'));
    upsertEnvVar('MEMORY_STORAGE_MODE', 'local');
    return;
  }

  upsertEnvVar('MEMORY_STORAGE_MODE', mode);

  if (mode === 'cloud' || mode === 'hybrid') {
    const { backend } = await inquirer.prompt<{ backend: string }>([
      {
        name: 'backend',
        type: 'list',
        message: yellow('Choose your cloud storage provider'),
        choices: [
          { name: `${green('●')} Google Drive — API (service account)`, value: 'gdrive_api' },
          { name: `${green('●')} Google Drive — CLI (GAM)`, value: 'gdrive_cli' },
          { name: `${green('●')} Microsoft OneDrive — CLI (mgc)`, value: 'onedrive' },
          { name: `${green('●')} Dropbox — API token`, value: 'dropbox' },
          { name: `${green('●')} Apple iCloud — macOS local container`, value: 'icloud' },
          { name: dim('Skip for now'), value: SKIP },
        ],
        default: 'gdrive_api',
      },
    ]);
    if (backend === SKIP) {
      console.log(dim('  ↪ Cloud provider skipped — set MEMORY_BACKEND in ~/.parix/.env later.'));
      return;
    }
    upsertEnvVar('MEMORY_BACKEND', backend);
    console.log(
      green(
        `  ✔ ${mode === 'hybrid' ? 'Hybrid: sensitive local, rest' : 'Cloud: all memory'} → ${backend}`,
      ),
    );
    console.log(
      dim('    Paste this provider\'s creds/tokens in ~/.parix/.env (see hands/memory/cloud_sync.py CloudConfig).'),
    );
  } else {
    console.log(green('  ✔ Local: memory stays on this machine.'));
  }
}

// A skill's dependency manager: python → pip, node → npm, else none.
function detectSkillManager(skillPath: string): 'pip' | 'npm' | 'none' {
  if (existsSync(join(skillPath, 'requirements.txt'))) return 'pip';
  if (existsSync(join(skillPath, 'package.json'))) return 'npm';
  const scriptsDir = join(skillPath, 'scripts');
  if (existsSync(scriptsDir)) {
    try {
      const files = readdirSync(scriptsDir);
      if (files.some((f) => f.endsWith('.py'))) return 'pip';
      if (files.some((f) => /\.(js|mjs|cjs|ts)$/.test(f))) return 'npm';
    } catch {
      /* ignore */
    }
  }
  return 'none';
}

// Skills step — pick which installed skills to enable; each is managed by its
// language's package manager (python→pip, node→npm). Selection persisted to
// PARIX_ACTIVE_SKILLS in ~/.parix/.env.
async function collectSkills(): Promise<void> {
  const skills = listInstalledSkills();
  if (skills.length === 0) {
    console.log(dim('  No installed skills found — skipping skill selection.'));
    return;
  }
  console.log('');
  const { selected } = await inquirer.prompt<{ selected: string[] }>([
    {
      name: 'selected',
      type: 'checkbox',
      message: yellow('Select skills to enable (managed by pip for Python, npm for Node)'),
      choices: [
        ...skills.map((s) => {
          const mgr = detectSkillManager(s.path);
          const mgrLabel =
            mgr === 'pip' ? green('pip') : mgr === 'npm' ? green('npm') : dim('no deps');
          return { name: `${s.id}  ${dim('—')} ${mgrLabel}`, value: s.id, checked: true };
        }),
        { name: dim('Skip for now'), value: SKIP },
      ],
    },
  ]);

  const enabled = selected.filter((id) => id !== SKIP);
  upsertEnvVar('PARIX_ACTIVE_SKILLS', enabled.join(','));
  if (enabled.length === 0) {
    console.log(dim('  ↪ No skills enabled.'));
    return;
  }
  const byMgr: Record<string, string[]> = { pip: [], npm: [], none: [] };
  for (const s of skills) {
    if (enabled.includes(s.id)) byMgr[detectSkillManager(s.path)].push(s.id);
  }
  if (byMgr.pip.length) console.log(green(`  ● pip manages: ${byMgr.pip.join(', ')}`));
  if (byMgr.npm.length) console.log(green(`  ● npm manages: ${byMgr.npm.join(', ')}`));
  console.log(green(`  ● ${enabled.length} skill(s) enabled.`));
}

// Final question: "How do you want to hatch your bot?" — Web UI or TUI.
async function collectHatchMethod(): Promise<'web' | 'tui'> {
  console.log('');
  const { hatch } = await inquirer.prompt<{ hatch: 'web' | 'tui' }>([
    {
      name: 'hatch',
      type: 'list',
      message: yellow('How do you want to hatch your bot?'),
      choices: [
        { name: `${green('●')} Web UI — open the Aegis dashboard in your browser`, value: 'web' },
        { name: `${green('●')} TUI — run headless, control from the terminal`, value: 'tui' },
      ],
      default: 'web',
    },
  ]);
  return hatch;
}

// Connection method shown next to each channel (OpenClaw-style labels).
const CHANNEL_METHODS: Record<string, string> = {
  telegram: 'Bot API',
  whatsapp: 'QR link',
  discord: 'Bot API',
  'google-chat': 'Chat API',
  slack: 'Socket Mode',
  signal: 'signal-cli',
  imessage: 'imsg',
  nostr: 'NIP-04 DMs',
  'microsoft-teams': 'Bot Framework',
  mattermost: 'plugin',
  'nextcloud-talk': 'self-hosted',
  matrix: 'plugin',
  line: 'Messaging API',
  feishu: 'Bot API',
  irc: 'IRC',
  'synology-chat': 'webhook',
  tlon: 'Urbit',
  twitch: 'chat OAuth',
  webchat: 'WebSocket',
  'voice-call': 'Twilio/Plivo',
  wechat: 'iLink',
  'qq-bot': 'Bot API',
  yuanbao: 'plugin',
  zalo: 'Bot API',
  'zalo-personal': 'Personal Account',
  webhook: 'HTTP',
  desktop: 'native',
};

function prettyChannelName(id: string): string {
  return id
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// "Telegram (Bot API)   (not configured)" — name + method + status suffix.
function channelChoiceLabel(id: string, configured: boolean): string {
  const method = CHANNEL_METHODS[id] ?? 'plugin';
  const base = `${prettyChannelName(id)} (${method})`;
  return configured ? `${base} ${green('(configured)')}` : `${base} ${dim('(not configured)')}`;
}

async function collectChannels(
  profile: ParixProfile,
  secrets: Record<string, string>,
): Promise<void> {
  console.log('');
  console.log(
    bold(cyan('  ┌─── select your channel (method) ──────────────────────┐')),
  );
  console.log(
    cyan('  │  Built-In Channels                                    │'),
  );
  console.log(
    dim('  │  These are directly integrated and highly popular     │'),
  );
  console.log(
    dim('  │  for controlling AI agents:                           │'),
  );
  console.log(
    dim('  │  - Telegram: recommended & fastest setup, Bot token   │'),
  );
  console.log(
    dim('  │  - WhatsApp: Baileys library QR code pairing          │'),
  );
  console.log(
    dim('  │  - Discord: direct native servers or via DMs          │'),
  );
  console.log(
    dim('  │  - Slack: configures via the Bolt SDK                 │'),
  );
  console.log(
    dim('  │  - iMessage: AppleScript bridge / BlueBubbles          │'),
  );
  console.log(
    dim('  │  - Signal: integrated via signal-cli                  │'),
  );
  console.log(
    dim('  │  - Google Chat                                        │'),
  );
  console.log(
    dim('  │  - IRC                                                │'),
  );
  console.log(
    dim('  │  - WebChat: provides a gateway over WebSocket         │'),
  );
  console.log(
    bold(cyan('  └───────────────────────────────────────────────────────┘')),
  );
  console.log('');

  const { wakeWord } = await inquirer.prompt<{ wakeWord: string }>([
    {
      name: 'wakeWord',
      type: 'input',
      message: 'Aegis wake word',
      default:
        profile.channels.settings.aegis?.wakeWord ?? DEFAULT_AEGIS_WAKE_WORD,
    },
  ]);

  const optionalChannelIds = getSelectableChannelIds(profile.mode);
  const { enabled } = await inquirer.prompt<{ enabled: string[] }>([
    {
      name: 'enabled',
      type: 'checkbox',
      message: yellow('Select your channels (space to toggle, enter to confirm — Aegis voice is always on)'),
      choices: [
        ...optionalChannelIds.map((id) => ({
          name: channelChoiceLabel(id, profile.channels.enabled.includes(id)),
          value: id,
          checked: profile.channels.enabled.includes(id),
        })),
        { name: dim('Skip for now'), value: '__skip__' },
      ],
    },
  ]);

  profile.channels.enabled = [
    'aegis',
    ...enabled.filter((id) => id !== 'aegis' && id !== '__skip__'),
  ];
  profile.channels.primary = 'aegis';
  profile.channels.settings = {
    ...profile.channels.settings,
    aegis: createDefaultAegisSettings(normalizeWakeWord(wakeWord)),
  };
  for (const channelId of profile.channels.enabled) {
    if (channelId === 'aegis') continue;
    profile.channels.settings[channelId] = {
      ...(profile.channels.settings[channelId] ?? {}),
      enabled: 'true',
      connectionMethod: isEnterpriseProfile(profile)
        ? 'official-integration'
        : 'configured',
    };
  }

  for (const secret of getRequiredSecrets(profile.llm, profile.channels)) {
    if (secrets[secret.key]) continue;
    const answer = await inquirer.prompt<{ value: string }>([
      {
        name: 'value',
        type: secret.masked ? 'password' : 'input',
        message: yellow(secret.label),
        mask: '*',
      },
    ]);
    if (answer.value) secrets[secret.key] = answer.value;
  }

  // Live validation pass — turn each selected channel green (or let the user
  // retry / skip). Same model as the LLM provider check.
  const toCheck = profile.channels.enabled.filter((id) => id !== 'aegis');
  for (const channelId of toCheck) {
    let done = false;
    while (!done) {
      process.stdout.write(dim(`  Validating ${channelId}... `));
      const { ok, detail } = await validateChannelCredential(channelId, secrets);
      if (ok) {
        console.log(green(`● ${channelId}: connected (${detail})`));
        done = true;
        break;
      }
      console.log(red(`○ ${channelId}: ${detail}`));
      const { action } = await inquirer.prompt<{ action: 'retry' | 'reenter' | 'skip' }>([
        {
          name: 'action',
          type: 'list',
          message: yellow(`${channelId} not connected — what now?`),
          choices: [
            { name: `${green('●')} Retry validation`, value: 'retry' },
            { name: `${green('●')} Re-enter credentials`, value: 'reenter' },
            { name: dim('Skip for now (configure later in ~/.parix/.env)'), value: 'skip' },
          ],
          default: 'retry',
        },
      ]);
      if (action === 'skip') {
        console.log(dim(`  ↪ ${channelId} left unconfigured.`));
        done = true;
      } else if (action === 'reenter') {
        for (const secret of getRequiredSecrets(profile.llm, profile.channels)) {
          const owner = secret.key.toLowerCase();
          if (!owner.startsWith(channelId.toLowerCase())) continue;
          const answer = await inquirer.prompt<{ value: string }>([
            { name: 'value', type: secret.masked ? 'password' : 'input', message: yellow(secret.label), mask: '*' },
          ]);
          if (answer.value) secrets[secret.key] = answer.value;
        }
      }
    }
  }
}

async function collectPermissions(profile: ParixProfile): Promise<void> {
  const defaults = profile.permissions;
  const { permissions } = await inquirer.prompt<{ permissions: string[] }>([
    {
      name: 'permissions',
      type: 'checkbox',
      message: 'Signals Parix may monitor',
      choices: [
        {
          name: 'Terminal errors',
          value: 'terminalErrors',
          checked: defaults.terminalErrors,
        },
        {
          name: 'Active window title',
          value: 'activeWindow',
          checked: defaults.activeWindow,
        },
        { name: 'Git state', value: 'gitState', checked: defaults.gitState },
        {
          name: 'Clipboard detection',
          value: 'clipboardDetection',
          checked: defaults.clipboardDetection,
        },
        {
          name: 'Browser tabs',
          value: 'browserTabs',
          checked: defaults.browserTabs,
        },
        {
          name: 'System health',
          value: 'systemHealth',
          checked: defaults.systemHealth,
        },
      ],
    },
  ]);

  profile.permissions = {
    terminalErrors: permissions.includes('terminalErrors'),
    activeWindow: permissions.includes('activeWindow'),
    gitState: permissions.includes('gitState'),
    clipboardDetection: permissions.includes('clipboardDetection'),
    browserTabs: permissions.includes('browserTabs'),
    systemHealth: permissions.includes('systemHealth'),
  };
}

async function collectHatcheryModules(profile: ParixProfile): Promise<void> {
  console.log('');
  console.log(
    bold(cyan('  ┌─── HATCHERY CONFIGURATION ────────────────────────────┐')),
  );
  console.log(
    dim('  │  The Hatchery contains everything else:               │'),
  );
  console.log(
    dim('  │  approval gates, audit loggers, execution policies,   │'),
  );
  console.log(
    dim('  │  and autonomous telemetry settings.                   │'),
  );
  console.log(
    bold(cyan('  └───────────────────────────────────────────────────────┘')),
  );
  console.log('');

  const { enabled } = await inquirer.prompt<{ enabled: string[] }>([
    {
      name: 'enabled',
      type: 'checkbox',
      message: 'Enabled Hatchery worker modules (lazy-loaded only when needed)',
      choices: HATCHERY_MODULES.map((module) => ({
        name:
          isEnterpriseProfile(profile) && module.id === 'audit-logger'
            ? `${module.label} (required for Enterprise)`
            : module.label,
        value: module.id,
        checked: profile.hatcheryModules.enabled.includes(module.id),
      })),
    },
  ]);

  const required = isEnterpriseProfile(profile)
    ? ['approval-gate', 'audit-logger']
    : ['approval-gate'];
  profile.hatcheryModules = {
    enabled: unique([...enabled, ...required]),
    lazyLoad: true,
    configuredAt: new Date().toISOString(),
  };
}

async function collectTelemetry(profile: ParixProfile): Promise<void> {
  console.log('');
  console.log('Telemetry (optional)');
  console.log(
    'Help improve Parix by sharing anonymous crash reports and version info.',
  );
  console.log('What is sent:    crash stack traces, Parix version, OS family.');
  console.log(
    'What is NOT:     prompts, LLM responses, channel messages, file contents, names.',
  );
  console.log('Full policy:     docs/privacy.md');
  console.log(
    'Default:         OFF. You can change this any time in your profile.',
  );
  console.log('');

  const { enabled } = await inquirer.prompt<{ enabled: boolean }>([
    {
      name: 'enabled',
      type: 'confirm',
      message: 'Send anonymous telemetry?',
      default: false,
    },
  ]);

  profile.telemetry = {
    enabled,
    consentedAt: enabled ? new Date().toISOString() : null,
  };
}

async function collectAutonomy(profile: ParixProfile): Promise<void> {
  console.log('');
  console.log('Autonomous mode (advanced)');
  console.log(
    'When ON, Parix skips skill-permission prompts for skills you have installed.',
  );
  console.log('First-party skills are unaffected — they are already trusted.');
  console.log(
    'The Constitution and autonomy thresholds still apply on every action.',
  );
  console.log(
    'Default:         OFF. Recommended unless you only install skills you trust.',
  );
  console.log('');

  const { enabled } = await inquirer.prompt<{ enabled: boolean }>([
    {
      name: 'enabled',
      type: 'confirm',
      message: 'Enable autonomous mode for installed skills?',
      default: false,
    },
  ]);

  profile.autonomy = {
    autonomousMode: enabled,
    enabledAt: enabled ? new Date().toISOString() : null,
  };
}

async function collectPersonality(profile: ParixProfile): Promise<void> {
  if (isPersonalProfile(profile)) {
    const answers = await inquirer.prompt<{
      agentName: string;
      style: 'concise' | 'friendly' | 'technical' | 'casual';
      vibe: 'proactive' | 'cautious' | 'balanced';
      interruptionLevel: 'minimal' | 'moderate' | 'aggressive';
      autonomyLevel: 'ask-before-fix' | 'safe-auto-fix' | 'full-auto';
    }>([
      {
        name: 'agentName',
        type: 'input',
        message: 'Agent name',
        default: profile.personality.agentName,
      },
      {
        name: 'style',
        type: 'list',
        message: 'Communication style',
        choices: ['friendly', 'concise', 'technical', 'casual'],
        default: profile.personality.style,
      },
      {
        name: 'vibe',
        type: 'list',
        message: 'Operating vibe',
        choices: ['balanced', 'proactive', 'cautious'],
        default: profile.personality.vibe,
      },
      {
        name: 'interruptionLevel',
        type: 'list',
        message: 'Interruption level',
        choices: ['minimal', 'moderate', 'aggressive'],
        default: profile.personality.interruptionLevel,
      },
      {
        name: 'autonomyLevel',
        type: 'list',
        message: 'Autonomy level',
        choices: [
          {
            name: 'Ask before fix - only trivial actions run alone',
            value: 'ask-before-fix',
          },
          {
            name: 'Safe auto fix - reversible fixes run alone',
            value: 'safe-auto-fix',
          },
          {
            name: 'Full auto - maximum autonomy with hard safety floors',
            value: 'full-auto',
          },
        ],
        default: profile.personality.autonomyLevel,
      },
    ]);
    profile.personality = answers;
    return;
  }

  if (isEnterpriseProfile(profile)) {
    const answers = await inquirer.prompt<{
      roleName: string;
      escalationStyle: 'immediate' | 'batch' | 'threshold';
      approvalPolicy: 'always-ask' | 'safe-auto' | 'policy-based';
      safetyBoundary: 'strict' | 'moderate';
      auditExpectation: 'full' | 'actions-only' | 'exceptions-only';
    }>([
      {
        name: 'roleName',
        type: 'input',
        message: 'Agent role name',
        default: profile.personality.roleName,
      },
      {
        name: 'escalationStyle',
        type: 'list',
        message: 'Escalation style',
        choices: ['threshold', 'immediate', 'batch'],
        default: profile.personality.escalationStyle,
      },
      {
        name: 'approvalPolicy',
        type: 'list',
        message: 'Approval policy',
        choices: ['always-ask', 'safe-auto', 'policy-based'],
        default: profile.personality.approvalPolicy,
      },
      {
        name: 'safetyBoundary',
        type: 'list',
        message: 'Safety boundary',
        choices: ['strict', 'moderate'],
        default: profile.personality.safetyBoundary,
      },
      {
        name: 'auditExpectation',
        type: 'list',
        message: 'Audit expectation',
        choices: ['full', 'actions-only', 'exceptions-only'],
        default: profile.personality.auditExpectation,
      },
    ]);
    profile.personality = answers;
  }
}

function capabilityFor(provider: string): LLMProviderCapability {
  return (
    LLM_PROVIDER_CAPABILITIES[provider] ?? {
      id: provider,
      name: provider,
      supportedAuthMethods: ['api_key'],
      defaultAuthMethod: 'api_key',
    }
  );
}

function labelAuthMethod(
  method: LLMAuthMethod,
  capability: LLMProviderCapability,
): string {
  switch (method) {
    case 'account_auth':
      return capability.accountAuthLabel ?? 'Account auth';
    case 'local':
      return 'Local runtime';
    case 'api_key':
    default:
      return 'API key';
  }
}

function syncAgentProfileWithRuntime(profile: ParixProfile): void {
  if (isPersonalProfile(profile)) {
    profile.agentProfile.allowedChannels = [...profile.channels.enabled];
    profile.agentProfile.agentName =
      profile.personality.agentName || profile.agentProfile.agentName;
    profile.identity.name =
      profile.agentProfile.userName ?? profile.identity.name;
    profile.identity.mainWorkflows = profile.agentProfile.primaryGoals;
    return;
  }

  if (isEnterpriseProfile(profile)) {
    profile.agentProfile.allowedChannels = [...profile.channels.enabled];
    profile.agentProfile.auditLoggingEnabled = true;
    profile.agentProfile.blockedActions = withEnterpriseRequiredBlocks(
      profile.agentProfile.blockedActions,
    );
    profile.agentProfile.approvalRequiredActions =
      withEnterpriseRequiredApprovals(
        profile.agentProfile.approvalRequiredActions,
      );
    profile.identity.companyName = profile.agentProfile.companyName;
    profile.identity.department = profile.agentProfile.teamName ?? '';
    profile.identity.allowedScope = profile.agentProfile.automaticActions;
    profile.identity.forbiddenScope = profile.agentProfile.blockedActions;
    profile.personality.roleName = profile.agentProfile.roleTitle;
    profile.personality.auditExpectation = 'full';
  }
}

function printOnboardingSummary(
  profile: ParixProfile,
  mcpServers: Record<string, McpServerDeclaration> = {},
): void {
  const mcpServerNames = Object.keys(mcpServers);
  console.log('');
  console.log('Final onboarding summary');
  console.log('------------------------');
  if (isPersonalProfile(profile)) {
    console.log(`Mode: Personal`);
    console.log(`User name: ${profile.agentProfile.userName || 'not set'}`);
    console.log(`Agent name: ${profile.agentProfile.agentName}`);
    console.log(`Tech stack: ${(profile.agentProfile as any).techStack || 'not set'}`);
    console.log(`Proactivity: ${(profile.agentProfile as any).proactivity || 'balanced'}`);
    console.log(`Tone: ${(profile.agentProfile as any).tone || 'friendly'}`);
    console.log(`Main mission: ${(profile.agentProfile as any).mainMission || 'not set'}`);
    console.log(`Vibe: ${profile.agentProfile.vibe || 'not set'}`);
    console.log(`Main goals: ${formatList(profile.agentProfile.primaryGoals)}`);
    console.log(`Connected LLM: ${profile.llm.provider}`);
    console.log(`Connected model: ${profile.llm.model}`);
    console.log(`Enabled channels: ${formatList(profile.channels.enabled)}`);
    console.log(`MCP servers: ${formatList(mcpServerNames)}`);
    console.log(
      `Enabled Hatchery modules: ${formatList(profile.hatcheryModules.enabled)}`,
    );
    console.log(
      `Approval rules: ${formatList(profile.agentProfile.approvalRequiredActions)}`,
    );
    console.log('');
    return;
  }

  if (isEnterpriseProfile(profile)) {
    console.log(`Mode: Enterprise`);
    console.log(
      `Company name: ${profile.agentProfile.companyName || 'not set'}`,
    );
    console.log(`Team: ${profile.agentProfile.teamName || 'not set'}`);
    console.log(`Agent name: ${profile.agentProfile.agentName}`);
    console.log(`Role: ${profile.agentProfile.roleTitle}`);
    console.log(`Tech stack: ${(profile.agentProfile as any).techStack || 'not set'}`);
    console.log(`Proactivity: ${(profile.agentProfile as any).proactivity || 'balanced'}`);
    console.log(`Tone: ${(profile.agentProfile as any).tone || 'friendly'}`);
    console.log(`Main mission: ${(profile.agentProfile as any).mainMission || 'not set'}`);
    console.log(
      `Responsibilities: ${formatList(profile.agentProfile.responsibilities)}`,
    );
    console.log(`Connected LLM: ${profile.llm.provider}`);
    console.log(`Connected model: ${profile.llm.model}`);
    console.log(`Enabled channels: ${formatList(profile.channels.enabled)}`);
    console.log(`MCP servers: ${formatList(mcpServerNames)}`);
    console.log(
      `Approval rules: ${formatList(profile.agentProfile.approvalRequiredActions)}`,
    );
    console.log(
      `Audit logging status: ${profile.agentProfile.auditLoggingEnabled ? 'enabled' : 'disabled'}`,
    );
    console.log(
      `Enabled Hatchery modules: ${formatList(profile.hatcheryModules.enabled)}`,
    );
    console.log('');
  }
}

function getSelectableChannelIds(mode: ProfileMode): string[] {
  const enterpriseOfficial = new Set([
    'desktop',
    'webhook',
    'discord',
    'slack',
    'microsoft-teams',
    'google-chat',
    'whatsapp',
    'matrix',
    'line',
    'feishu',
    'mattermost',
    'nextcloud-talk',
    'synology-chat',
    'webchat',
    'voice-call',
    'wechat',
    'qq-bot',
    'zalo',
  ]);

  return CHANNEL_IDS.filter((id) => id !== 'aegis').filter((id) =>
    mode === 'enterprise' ? enterpriseOfficial.has(id) : true,
  );
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
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(', ') : 'none';
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitCommandArgs(value: string): string[] {
  const matches = value.match(/"([^"]*)"|'([^']*)'|\S+/g) ?? [];
  return matches.map((item) => item.replace(/^["']|["']$/g, ''));
}

function normalizeWakeWord(value: string): string {
  const normalized = value.trim().toLowerCase();
  return normalized || DEFAULT_AEGIS_WAKE_WORD;
}

function openBrowser(url: string): void {
  try {
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', url], {
        detached: true,
        stdio: 'ignore',
      }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch {
    console.log(`[hatchery] Open this URL manually: ${url}`);
  }
}
