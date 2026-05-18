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
  getRequiredSecrets,
  saveAuthProfile,
  writeProfile,
} from './config-writer.js';
import { formatInstalledSkillLines, listInstalledSkills } from './skills.js';

export interface TuiResult {
  completed: boolean;
  profile?: ParixProfile;
}

const ACCOUNT_AUTH_URLS: Record<string, string> = {
  openai: 'https://chatgpt.com/auth/login',
  anthropic: 'https://claude.ai/login',
  groq: 'https://console.groq.com/login',
  grok: 'https://console.x.ai/',
  perplexity: 'https://www.perplexity.ai/settings/api',
  mistral: 'https://console.mistral.ai/',
  kimi: 'https://platform.moonshot.ai/console',
  openrouter: 'https://openrouter.ai/settings/keys',
  bytez: 'https://platform.bytez.com/',
  copilot: 'https://github.com/login',
  deepseek: 'https://platform.deepseek.com/',
};

export async function runTuiWizard(): Promise<TuiResult> {
  console.log('');
  console.log('Parix Onboarding');
  console.log('Connect your LLM provider with account auth where possible, or use an API key.');
  console.log('');
  console.log('Installed skills');
  for (const line of formatInstalledSkillLines(listInstalledSkills())) {
    console.log(line);
  }
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
  await collectChannels(profile, secrets);
  await collectPermissions(profile);
  await collectHatcheryModules(profile);
  await collectTelemetry(profile);
  await collectAutonomy(profile);
  syncAgentProfileWithRuntime(profile);
  printOnboardingSummary(profile);

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
  return { completed: true, profile };
}

function printModeIntro(mode: ProfileMode): void {
  console.log('');
  if (mode === 'personal') {
    console.log(`Hey, I came online.

Set my vibe.

Tell me:
- Who are you?
- Who am I to you?
- What should I call you?
- What personality/vibe should I have?
- What should I help you with?
- What should I never do?
- Which channels can I use?
- What should I remember?`);
    console.log('');
    return;
  }

  console.log(`Hey, I came online.

Tell me my role, my tasks, my channels, company name, team, and approval rules so I can work like a co-worker with your team.`);
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
      blockedActions: string;
      approvalRequiredActions: string;
      rememberUserPreferences: boolean;
      rememberProjectContext: boolean;
      rememberPersonalContext: boolean;
    }>([
      { name: 'userDescription', type: 'input', message: 'Who are you?', default: '' },
      { name: 'relationshipLabel', type: 'input', message: 'Who am I to you?', default: 'personal agent' },
      { name: 'userName', type: 'input', message: 'What should I call you?', default: profile.agentProfile.userName ?? '' },
      { name: 'agentName', type: 'input', message: 'What should I call myself?', default: profile.agentProfile.agentName },
      { name: 'vibe', type: 'input', message: 'What vibe should I have?', default: profile.agentProfile.vibe ?? 'warm, direct, proactive' },
      { name: 'personality', type: 'input', message: 'What personality should I have?', default: profile.agentProfile.personality ?? 'friendly, capable, and candid' },
      { name: 'primaryGoals', type: 'input', message: 'What should I help you with?', default: profile.agentProfile.primaryGoals.join(', ') },
      { name: 'recurringTasks', type: 'input', message: 'Recurring tasks I should remember', default: profile.agentProfile.recurringTasks.join(', ') },
      { name: 'blockedActions', type: 'input', message: 'What should I never do?', default: profile.agentProfile.blockedActions.join(', ') },
      { name: 'approvalRequiredActions', type: 'input', message: 'What should require approval?', default: profile.agentProfile.approvalRequiredActions.join(', ') },
      { name: 'rememberUserPreferences', type: 'confirm', message: 'Remember your preferences?', default: profile.agentProfile.memoryPreferences.rememberUserPreferences },
      { name: 'rememberProjectContext', type: 'confirm', message: 'Remember project context?', default: profile.agentProfile.memoryPreferences.rememberProjectContext },
      { name: 'rememberPersonalContext', type: 'confirm', message: 'Remember personal context?', default: profile.agentProfile.memoryPreferences.rememberPersonalContext },
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
      allowedTools: string;
      reportingTo: string;
      automaticActions: string;
      approvalRequiredActions: string;
      blockedActions: string;
      companyMemory: boolean;
      teamMemory: boolean;
      customerDataMemory: boolean;
    }>([
      { name: 'companyName', type: 'input', message: 'Company name', default: profile.agentProfile.companyName },
      { name: 'teamName', type: 'input', message: 'Team name', default: profile.agentProfile.teamName ?? '' },
      { name: 'agentName', type: 'input', message: 'Agent name', default: profile.agentProfile.agentName },
      { name: 'roleTitle', type: 'input', message: 'Agent role', default: profile.agentProfile.roleTitle },
      { name: 'roleDescription', type: 'input', message: 'Role description', default: profile.agentProfile.roleDescription },
      { name: 'responsibilities', type: 'input', message: 'Responsibilities', default: profile.agentProfile.responsibilities.join(', ') },
      { name: 'recurringTasks', type: 'input', message: 'Recurring tasks', default: profile.agentProfile.recurringTasks.join(', ') },
      { name: 'allowedTools', type: 'input', message: 'Tools to join through official integrations', default: profile.agentProfile.allowedTools.join(', ') || 'Slack, Teams, Gmail, GitHub, CRM' },
      { name: 'reportingTo', type: 'input', message: 'Who does the agent report to?', default: profile.agentProfile.reportingTo ?? '' },
      { name: 'automaticActions', type: 'input', message: 'What can the agent do automatically?', default: profile.agentProfile.automaticActions.join(', ') },
      { name: 'approvalRequiredActions', type: 'input', message: 'What needs human approval?', default: profile.agentProfile.approvalRequiredActions.join(', ') },
      { name: 'blockedActions', type: 'input', message: 'What must the agent never do?', default: profile.agentProfile.blockedActions.join(', ') },
      { name: 'companyMemory', type: 'confirm', message: 'Allow company memory?', default: profile.agentProfile.memoryBoundaries.companyMemory },
      { name: 'teamMemory', type: 'confirm', message: 'Allow team memory?', default: profile.agentProfile.memoryBoundaries.teamMemory },
      { name: 'customerDataMemory', type: 'confirm', message: 'Allow customer data memory?', default: profile.agentProfile.memoryBoundaries.customerDataMemory },
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
      reportingTo: answers.reportingTo.trim(),
      allowedChannels: [...profile.channels.enabled],
      allowedTools: splitList(answers.allowedTools),
      automaticActions: splitList(answers.automaticActions),
      blockedActions: withEnterpriseRequiredBlocks(splitList(answers.blockedActions)),
      approvalRequiredActions: withEnterpriseRequiredApprovals(splitList(answers.approvalRequiredActions)),
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
      { name: 'companyName', type: 'input', message: 'Company name', default: '' },
      { name: 'industry', type: 'input', message: 'Industry', default: '' },
      { name: 'department', type: 'input', message: 'Department', default: 'IT' },
      { name: 'userRole', type: 'input', message: 'Your role', default: '' },
      { name: 'allowedScope', type: 'input', message: 'Allowed automation scope', default: 'local diagnostics, logs' },
      { name: 'forbiddenScope', type: 'input', message: 'Forbidden scope', default: 'production deploys, billing changes' },
    ]);
    profile.identity.companyName = answers.companyName;
    profile.identity.industry = answers.industry;
    profile.identity.department = answers.department;
    profile.identity.userRole = answers.userRole;
    profile.identity.allowedScope = splitList(answers.allowedScope);
    profile.identity.forbiddenScope = splitList(answers.forbiddenScope);
  }
}

async function collectLlm(profile: ParixProfile, secrets: Record<string, string>): Promise<void> {
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
  const authMethod = await chooseAuthMethod(capability);
  const defaultModel = DEFAULT_MODELS[provider] ?? profile.llm.model;
  const { model } = await inquirer.prompt<{ model: string }>([
    {
      name: 'model',
      type: 'input',
      message: 'Default model',
      default: defaultModel,
    },
  ]);

  profile.llm.provider = provider;
  profile.llm.model = model.trim() || defaultModel;
  profile.llm.authMethod = authMethod;
  profile.llm.authProfileId = null;
  profile.llm.connectionVerified = authMethod === 'local';
  profile.llm.verifiedAt = authMethod === 'local' ? new Date().toISOString() : null;

  if (authMethod === 'local') {
    const envKey = PROVIDER_ENV_KEYS[provider];
    if (envKey) {
      const { baseUrl } = await inquirer.prompt<{ baseUrl: string }>([
        {
          name: 'baseUrl',
          type: 'input',
          message: `${capability.name} local endpoint`,
          default: provider === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234/v1',
        },
      ]);
      if (baseUrl) secrets[envKey] = baseUrl;
    }
    return;
  }

  if (authMethod === 'api_key') {
    const envKey = PROVIDER_ENV_KEYS[provider];
    if (envKey) {
      const { apiKey } = await inquirer.prompt<{ apiKey: string }>([
        {
          name: 'apiKey',
          type: envKey.endsWith('_URL') ? 'input' : 'password',
          message: envKey.endsWith('_URL') ? `${provider} local/base URL` : `${provider} API key`,
          mask: '*',
        },
      ]);
      if (apiKey) secrets[envKey] = apiKey;
    }
    return;
  }

  if (authMethod === 'account_auth') {
    const profileId = `${provider}:account:default`;
    const authProfile = await runAccountAuth(provider, capability, profileId);
    profile.llm.authProfileId = authProfile.id;
  }
}

async function chooseAuthMethod(capability: LLMProviderCapability): Promise<LLMAuthMethod> {
  if (capability.supportedAuthMethods.length === 1) {
    return capability.supportedAuthMethods[0];
  }

  const { authMethod } = await inquirer.prompt<{ authMethod: LLMAuthMethod }>([
    {
      name: 'authMethod',
      type: 'list',
      message: `Connect ${capability.name} using`,
      choices: capability.supportedAuthMethods.map((method) => ({
        name: labelAuthMethod(method, capability),
        value: method,
      })),
      default: capability.defaultAuthMethod,
    },
  ]);
  return authMethod;
}

async function runAccountAuth(
  provider: string,
  capability: LLMProviderCapability,
  profileId: string
): Promise<LLMAuthProfile> {
  const authUrl = ACCOUNT_AUTH_URLS[provider];

  console.log('');
  console.log(capability.accountAuthInstructions ?? `Use your ${capability.name} account auth flow.`);
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
      message: 'Optional access token/session token if the provider flow gave you one',
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

async function collectChannels(profile: ParixProfile, secrets: Record<string, string>): Promise<void> {
  console.log('');
  console.log('Aegis is the default local voice channel. Choose the wake word before selecting optional outbound channels.');
  if (isEnterpriseProfile(profile)) {
    console.log('Enterprise channels must use official OAuth, bot apps, APIs, or webhooks. Parix will identify itself as the configured agent name.');
  }

  const { wakeWord } = await inquirer.prompt<{ wakeWord: string }>([
    {
      name: 'wakeWord',
      type: 'input',
      message: 'Aegis wake word',
      default: profile.channels.settings.aegis?.wakeWord ?? DEFAULT_AEGIS_WAKE_WORD,
    },
  ]);

  const optionalChannelIds = getSelectableChannelIds(profile.mode);
  const { enabled } = await inquirer.prompt<{ enabled: string[] }>([
    {
      name: 'enabled',
      type: 'checkbox',
      message: 'Additional notification channels (Aegis voice is always enabled)',
      choices: optionalChannelIds.map((id) => ({
        name: id,
        value: id,
        checked: profile.channels.enabled.includes(id),
      })),
    },
  ]);

  profile.channels.enabled = ['aegis', ...enabled.filter((id) => id !== 'aegis')];
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
      connectionMethod: isEnterpriseProfile(profile) ? 'official-integration' : 'configured',
    };
  }

  for (const secret of getRequiredSecrets(profile.llm, profile.channels)) {
    if (secrets[secret.key]) continue;
    const answer = await inquirer.prompt<{ value: string }>([
      {
        name: 'value',
        type: secret.masked ? 'password' : 'input',
        message: secret.label,
        mask: '*',
      },
    ]);
    if (answer.value) secrets[secret.key] = answer.value;
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
        { name: 'Terminal errors', value: 'terminalErrors', checked: defaults.terminalErrors },
        { name: 'Active window title', value: 'activeWindow', checked: defaults.activeWindow },
        { name: 'Git state', value: 'gitState', checked: defaults.gitState },
        { name: 'Clipboard detection', value: 'clipboardDetection', checked: defaults.clipboardDetection },
        { name: 'Browser tabs', value: 'browserTabs', checked: defaults.browserTabs },
        { name: 'System health', value: 'systemHealth', checked: defaults.systemHealth },
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

  const required = isEnterpriseProfile(profile) ? ['approval-gate', 'audit-logger'] : ['approval-gate'];
  profile.hatcheryModules = {
    enabled: unique([...enabled, ...required]),
    lazyLoad: true,
    configuredAt: new Date().toISOString(),
  };
}

async function collectTelemetry(profile: ParixProfile): Promise<void> {
  console.log('');
  console.log('Telemetry (optional)');
  console.log('Help improve Parix by sharing anonymous crash reports and version info.');
  console.log('What is sent:    crash stack traces, Parix version, OS family.');
  console.log('What is NOT:     prompts, LLM responses, channel messages, file contents, names.');
  console.log('Full policy:     docs/privacy.md');
  console.log('Default:         OFF. You can change this any time in your profile.');
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
  console.log('When ON, Parix skips skill-permission prompts for skills you have installed.');
  console.log('First-party skills are unaffected — they are already trusted.');
  console.log('The Constitution and autonomy thresholds still apply on every action.');
  console.log('Default:         OFF. Recommended unless you only install skills you trust.');
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
      { name: 'agentName', type: 'input', message: 'Agent name', default: profile.personality.agentName },
      { name: 'style', type: 'list', message: 'Communication style', choices: ['friendly', 'concise', 'technical', 'casual'], default: profile.personality.style },
      { name: 'vibe', type: 'list', message: 'Operating vibe', choices: ['balanced', 'proactive', 'cautious'], default: profile.personality.vibe },
      { name: 'interruptionLevel', type: 'list', message: 'Interruption level', choices: ['minimal', 'moderate', 'aggressive'], default: profile.personality.interruptionLevel },
      {
        name: 'autonomyLevel',
        type: 'list',
        message: 'Autonomy level',
        choices: [
          { name: 'Ask before fix - only trivial actions run alone', value: 'ask-before-fix' },
          { name: 'Safe auto fix - reversible fixes run alone', value: 'safe-auto-fix' },
          { name: 'Full auto - maximum autonomy with hard safety floors', value: 'full-auto' },
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
      { name: 'roleName', type: 'input', message: 'Agent role name', default: profile.personality.roleName },
      { name: 'escalationStyle', type: 'list', message: 'Escalation style', choices: ['threshold', 'immediate', 'batch'], default: profile.personality.escalationStyle },
      { name: 'approvalPolicy', type: 'list', message: 'Approval policy', choices: ['always-ask', 'safe-auto', 'policy-based'], default: profile.personality.approvalPolicy },
      { name: 'safetyBoundary', type: 'list', message: 'Safety boundary', choices: ['strict', 'moderate'], default: profile.personality.safetyBoundary },
      { name: 'auditExpectation', type: 'list', message: 'Audit expectation', choices: ['full', 'actions-only', 'exceptions-only'], default: profile.personality.auditExpectation },
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

function labelAuthMethod(method: LLMAuthMethod, capability: LLMProviderCapability): string {
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
    profile.agentProfile.agentName = profile.personality.agentName || profile.agentProfile.agentName;
    profile.identity.name = profile.agentProfile.userName ?? profile.identity.name;
    profile.identity.mainWorkflows = profile.agentProfile.primaryGoals;
    return;
  }

  if (isEnterpriseProfile(profile)) {
    profile.agentProfile.allowedChannels = [...profile.channels.enabled];
    profile.agentProfile.auditLoggingEnabled = true;
    profile.agentProfile.blockedActions = withEnterpriseRequiredBlocks(profile.agentProfile.blockedActions);
    profile.agentProfile.approvalRequiredActions = withEnterpriseRequiredApprovals(
      profile.agentProfile.approvalRequiredActions
    );
    profile.identity.companyName = profile.agentProfile.companyName;
    profile.identity.department = profile.agentProfile.teamName ?? '';
    profile.identity.allowedScope = profile.agentProfile.automaticActions;
    profile.identity.forbiddenScope = profile.agentProfile.blockedActions;
    profile.personality.roleName = profile.agentProfile.roleTitle;
    profile.personality.auditExpectation = 'full';
  }
}

function printOnboardingSummary(profile: ParixProfile): void {
  console.log('');
  console.log('Final onboarding summary');
  console.log('------------------------');
  if (isPersonalProfile(profile)) {
    console.log(`Mode: Personal`);
    console.log(`User name: ${profile.agentProfile.userName || 'not set'}`);
    console.log(`Agent name: ${profile.agentProfile.agentName}`);
    console.log(`Vibe: ${profile.agentProfile.vibe || 'not set'}`);
    console.log(`Main goals: ${formatList(profile.agentProfile.primaryGoals)}`);
    console.log(`Connected LLM: ${profile.llm.provider}`);
    console.log(`Connected model: ${profile.llm.model}`);
    console.log(`Enabled channels: ${formatList(profile.channels.enabled)}`);
    console.log(`Enabled Hatchery modules: ${formatList(profile.hatcheryModules.enabled)}`);
    console.log(`Approval rules: ${formatList(profile.agentProfile.approvalRequiredActions)}`);
    console.log('');
    return;
  }

  if (isEnterpriseProfile(profile)) {
    console.log(`Mode: Enterprise`);
    console.log(`Company name: ${profile.agentProfile.companyName || 'not set'}`);
    console.log(`Team: ${profile.agentProfile.teamName || 'not set'}`);
    console.log(`Agent name: ${profile.agentProfile.agentName}`);
    console.log(`Role: ${profile.agentProfile.roleTitle}`);
    console.log(`Responsibilities: ${formatList(profile.agentProfile.responsibilities)}`);
    console.log(`Connected LLM: ${profile.llm.provider}`);
    console.log(`Connected model: ${profile.llm.model}`);
    console.log(`Enabled channels: ${formatList(profile.channels.enabled)}`);
    console.log(`Approval rules: ${formatList(profile.agentProfile.approvalRequiredActions)}`);
    console.log(`Audit logging status: ${profile.agentProfile.auditLoggingEnabled ? 'enabled' : 'disabled'}`);
    console.log(`Enabled Hatchery modules: ${formatList(profile.hatcheryModules.enabled)}`);
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
    mode === 'enterprise' ? enterpriseOfficial.has(id) : true
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
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
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

function normalizeWakeWord(value: string): string {
  const normalized = value.trim().toLowerCase();
  return normalized || DEFAULT_AEGIS_WAKE_WORD;
}

function openBrowser(url: string): void {
  try {
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch {
    console.log(`[hatchery] Open this URL manually: ${url}`);
  }
}
