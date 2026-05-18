/**
 * Config Writer — validates, persists, and manages Parix profiles + secrets.
 *
 * Secret storage strategy:
 *   1. keytar (OS keychain) — primary if available
 *   2. .env file           — fallback if keytar fails/unavailable
 *   3. Environment vars    — runtime override (always wins)
 *
 * This module is the ONLY place that writes profile.json and .env.
 * All other modules read through shared/hatchery-schema.ts loadProfile().
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import {
  type ParixProfile,
  type LLMConfig,
  type LLMAuthProfile,
  type ChannelConfig,
  validateProfile,
  saveProfile,
  getProfilePath,
  PROVIDER_ENV_KEYS,
  isPersonalProfile,
  isEnterpriseProfile,
} from 'parix-shared';

// ─── PARIX_HOME resolution ──────────────────────────────────────────

function getParixHome(): string {
  return (
    process.env.PARIX_HOME ||
    resolve(process.env.HOME || process.env.USERPROFILE || '', '.parix')
  );
}

function getEnvPath(): string {
  return resolve(getParixHome(), '.env');
}

function getAuthProfilesPath(): string {
  return resolve(getParixHome(), 'auth-profiles.json');
}

// ─── Keytar (optional — graceful degradation) ────────────────────────

const KEYTAR_SERVICE = 'parix-agent';

interface KeytarModule {
  setPassword(service: string, account: string, password: string): Promise<void>;
  getPassword(service: string, account: string): Promise<string | null>;
  deletePassword(service: string, account: string): Promise<boolean>;
  findCredentials(service: string): Promise<Array<{ account: string; password: string }>>;
}

let _keytar: KeytarModule | null = null;
let _keytarChecked = false;

async function getKeytar(): Promise<KeytarModule | null> {
  if (_keytarChecked) return _keytar;
  _keytarChecked = true;

  try {
    _keytar = await import('keytar') as unknown as KeytarModule;
    return _keytar;
  } catch {
    console.log('[HATCHERY] keytar not available — using .env for secrets');
    return null;
  }
}

// ─── Secret Storage ──────────────────────────────────────────────────

export async function storeSecret(key: string, value: string): Promise<void> {
  const keytar = await getKeytar();

  if (keytar) {
    try {
      await keytar.setPassword(KEYTAR_SERVICE, key, value);
      return;
    } catch (err) {
      console.warn('[HATCHERY] keytar write failed, falling back to .env:', err);
    }
  }

  // Fallback: write to .env
  writeEnvVar(key, value);
}

export async function readSecret(key: string): Promise<string | null> {
  // Environment variable always wins
  const envVal = process.env[key];
  if (envVal) return envVal;

  // Try keytar
  const keytar = await getKeytar();
  if (keytar) {
    try {
      const val = await keytar.getPassword(KEYTAR_SERVICE, key);
      if (val) return val;
    } catch {
      // fall through to .env
    }
  }

  // Fallback: read from .env
  return readEnvVar(key);
}

export async function deleteSecret(key: string): Promise<void> {
  const keytar = await getKeytar();
  if (keytar) {
    try {
      await keytar.deletePassword(KEYTAR_SERVICE, key);
    } catch {
      // ignore
    }
  }

  // Also remove from .env if present
  removeEnvVar(key);
}

export async function clearAllSecrets(): Promise<void> {
  const keytar = await getKeytar();
  if (keytar) {
    try {
      const creds = await keytar.findCredentials(KEYTAR_SERVICE);
      for (const cred of creds) {
        await keytar.deletePassword(KEYTAR_SERVICE, cred.account);
      }
    } catch {
      // ignore
    }
  }

  // Also clear secrets from .env
  const envPath = getEnvPath();
  if (existsSync(envPath)) {
    const env = readEnvFile(envPath);
    const secretKeys = Object.values(PROVIDER_ENV_KEYS).concat([
      'TELEGRAM_BOT_TOKEN',
      'TELEGRAM_CHAT_ID',
      'DISCORD_BOT_TOKEN',
      'DISCORD_APPLICATION_ID',
      'DISCORD_DEFAULT_CHANNEL_ID',
      'DISCORD_WEBHOOK_URL',
      'SLACK_BOT_TOKEN',
      'SLACK_SIGNING_SECRET',
      'SLACK_APP_TOKEN',
      'SLACK_DEFAULT_CHANNEL_ID',
      'TEAMS_APP_ID',
      'TEAMS_APP_PASSWORD',
      'TEAMS_TENANT_ID',
      'TEAMS_DEFAULT_CONVERSATION_ID',
      'GOOGLE_CHAT_WEBHOOK_URL',
      'WHATSAPP_SESSION_DIR',
      'WHATSAPP_DEFAULT_JID',
      'SIGNAL_CLI_PATH',
      'SIGNAL_ACCOUNT',
      'SIGNAL_DEFAULT_RECIPIENT',
      'MATRIX_HOMESERVER_URL',
      'MATRIX_ACCESS_TOKEN',
      'MATRIX_DEFAULT_ROOM_ID',
      'LINE_CHANNEL_ACCESS_TOKEN',
      'LINE_CHANNEL_SECRET',
      'LINE_DEFAULT_USER_ID',
      'FEISHU_APP_ID',
      'FEISHU_APP_SECRET',
      'FEISHU_DEFAULT_CHAT_ID',
      'MATTERMOST_URL',
      'MATTERMOST_BOT_TOKEN',
      'MATTERMOST_DEFAULT_CHANNEL_ID',
      'NEXTCLOUD_URL',
      'NEXTCLOUD_USERNAME',
      'NEXTCLOUD_APP_PASSWORD',
      'NEXTCLOUD_TALK_TOKEN',
      'IRC_SERVER',
      'IRC_PORT',
      'IRC_NICK',
      'IRC_CHANNELS',
      'IRC_ALLOWLIST',
      'NOSTR_PRIVATE_KEY',
      'NOSTR_RELAYS',
      'NOSTR_DEFAULT_PUBKEY',
      'SYNOLOGY_CHAT_WEBHOOK_URL',
      'SYNOLOGY_CHAT_INCOMING_TOKEN',
      'TLON_SHIP_URL',
      'TLON_CODE',
      'TLON_DEFAULT_CHANNEL',
      'TWITCH_BOT_USERNAME',
      'TWITCH_OAUTH_TOKEN',
      'TWITCH_CHANNEL',
      'WEBCHAT_WS_URL',
      'WEBCHAT_SHARED_SECRET',
      'IMSG_BRIDGE_URL',
      'IMSG_BRIDGE_TOKEN',
      'IMSG_DEFAULT_CHAT',
      'VOICE_PROVIDER',
      'TWILIO_ACCOUNT_SID',
      'TWILIO_AUTH_TOKEN',
      'TWILIO_FROM_NUMBER',
      'PLIVO_AUTH_ID',
      'PLIVO_AUTH_TOKEN',
      'PLIVO_FROM_NUMBER',
      'VOICE_DEFAULT_TO_NUMBER',
      'WECHAT_ILINK_URL',
      'WECHAT_SESSION_DIR',
      'WECHAT_DEFAULT_USER_ID',
      'QQ_BOT_APP_ID',
      'QQ_BOT_TOKEN',
      'QQ_BOT_SECRET',
      'QQ_DEFAULT_TARGET_ID',
      'YUANBAO_PLUGIN_URL',
      'YUANBAO_TOKEN',
      'YUANBAO_DEFAULT_CHAT_ID',
      'ZALO_APP_ID',
      'ZALO_APP_SECRET',
      'ZALO_ACCESS_TOKEN',
      'ZALO_DEFAULT_USER_ID',
      'ZALO_PERSONAL_SESSION_DIR',
      'ZALO_PERSONAL_DEFAULT_THREAD_ID',
      'PARIX_WEBHOOK_URL',
    ]);
    for (const k of secretKeys) {
      delete env[k];
    }
    writeEnvFile(envPath, env);
  }
}

export interface StoredAuthProfiles {
  version: 1;
  profiles: LLMAuthProfile[];
}

export function readAuthProfiles(): StoredAuthProfiles {
  const path = getAuthProfilesPath();
  if (!existsSync(path)) return { version: 1, profiles: [] };

  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as StoredAuthProfiles;
    return {
      version: 1,
      profiles: Array.isArray(raw.profiles) ? raw.profiles : [],
    };
  } catch {
    return { version: 1, profiles: [] };
  }
}

export async function saveAuthProfile(profile: LLMAuthProfile, secret?: string): Promise<LLMAuthProfile> {
  const now = new Date().toISOString();
  const nextProfile: LLMAuthProfile = {
    ...profile,
    updatedAt: now,
    createdAt: profile.createdAt || now,
  };

  if (secret && nextProfile.secretRef) {
    await storeSecret(nextProfile.secretRef, secret);
  }

  const store = readAuthProfiles();
  const idx = store.profiles.findIndex((item) => item.id === nextProfile.id);
  if (idx >= 0) {
    store.profiles[idx] = nextProfile;
  } else {
    store.profiles.push(nextProfile);
  }

  const path = getAuthProfilesPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(store, null, 2) + '\n', 'utf-8');
  return nextProfile;
}

// ─── .env File Helpers ──────────────────────────────────────────────

function readEnvFile(path: string): Record<string, string> {
  const env: Record<string, string> = {};
  if (!existsSync(path)) return env;

  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && val) {
      env[key] = val;
    }
  }
  return env;
}

function writeEnvFile(path: string, env: Record<string, string>): void {
  mkdirSync(dirname(path), { recursive: true });
  const lines = Object.entries(env)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`);
  writeFileSync(path, lines.join('\n') + '\n', 'utf-8');
}

function writeEnvVar(key: string, value: string): void {
  const path = getEnvPath();
  const env = readEnvFile(path);
  env[key] = value;
  writeEnvFile(path, env);
}

function readEnvVar(key: string): string | null {
  const env = readEnvFile(getEnvPath());
  return env[key] || null;
}

function removeEnvVar(key: string): void {
  const path = getEnvPath();
  if (!existsSync(path)) return;
  const env = readEnvFile(path);
  delete env[key];
  writeEnvFile(path, env);
}

// ─── Profile Persistence ────────────────────────────────────────────

export interface WriteProfileResult {
  success: boolean;
  profilePath: string;
  errors: string[];
}

/**
 * Validates and writes a complete profile.
 * Stores secrets via keytar (or .env fallback).
 * Profile.json NEVER contains raw secrets.
 */
export async function writeProfile(
  profile: ParixProfile,
  secrets: Record<string, string>
): Promise<WriteProfileResult> {
  const parixHome = getParixHome();
  const profilePath = getProfilePath(parixHome);

  // Validate profile
  const validation = validateProfile(profile);
  if (!validation.valid) {
    return { success: false, profilePath, errors: validation.errors };
  }

  // Store secrets
  for (const [key, value] of Object.entries(secrets)) {
    if (value) {
      await storeSecret(key, value);
    }
  }

  // Write profile (no secrets in this file)
  const saved = saveProfile(profile, parixHome);
  if (!saved) {
    return {
      success: false,
      profilePath,
      errors: ['Failed to write profile.json'],
    };
  }

  writeWorkspaceMarkdown(profile, process.env.PARIX_WORKSPACE || process.cwd());

  return { success: true, profilePath, errors: [] };
}

export interface WorkspaceMarkdownResult {
  root: string;
  written: string[];
  skipped: string[];
}

export function writeWorkspaceMarkdown(
  profile: ParixProfile,
  root = process.env.PARIX_HOME || resolve(process.cwd())
): WorkspaceMarkdownResult {
  const today = new Date().toISOString().slice(0, 10);
  const agentName = getAgentName(profile);
  const userName = getUserName(profile);
  const role = getRole(profile);
  const approvalRules = getApprovalRules(profile);
  const blockedActions = getBlockedActions(profile);
  const modules = profile.hatcheryModules.enabled.join(', ') || 'none';
  const files: Record<string, string> = {
    'IDENTITY.md': `# ${agentName} Identity\n\n- Agent name: ${agentName}\n- Routing ID: parix.atrium.local\n- Active role: ${role}\n- Mode: ${profile.mode}\n- Avatar: Parix magenta Atrium mark\n- Default channel: Aegis Voice\n- Aegis wake word: ${profile.channels.settings.aegis?.wakeWord ?? 'aegis'}\n`,
    'SOUL.md': `# ${agentName} Soul\n\n${agentName} is a local-first, proactive operator for ${userName || 'the user'}.\n\n## Voice\n\n- ${getVoice(profile)}\n- Explain actions plainly before risky work.\n- Prefer useful initiative over passive waiting.\n- Clearly identify as ${agentName}.\n\n## Values\n\n- Protect user agency.\n- Keep memory within configured boundaries.\n- Repair before replacing.\n- Leave an audit trail for meaningful actions.\n`,
    'USER.md': buildUserMarkdown(profile),
    'AGENTS.md': `# Parix Agent Operations\n\n## Turn Protocol\n\n1. Read the current user request.\n2. Check local workspace context and relevant memory.\n3. Respect channel, safety, and permission settings.\n4. Prefer reversible actions and explain higher-risk steps.\n5. Log durable outcomes to memory when useful.\n\n## Active Constraints\n\n- Mode: ${profile.mode}\n- Primary channel: ${profile.channels.primary}\n- Enabled channels: ${profile.channels.enabled.join(', ')}\n- Approval required: ${approvalRules || 'none'}\n- Blocked actions: ${blockedActions || 'none'}\n- Hatchery modules: ${modules}\n- Module startup: lazy-load only when needed\n`,
    'TOOLS.md': `# Parix Tools Registry\n\n## Local Runtime\n\n- Atrium: Node.js brain\n- Hands: Python executor and sensors\n- Aegis: voice-first local dashboard\n- Hatchery: onboarding and setup\n\n## Authorized Workspace Paths\n\n- Project root: ${root}\n- Skills: ${resolve(root, '.agents/skills')}\n- Daily memory: ${resolve(root, 'memory')}\n- Checklists: ${resolve(root, 'checklists')}\n\n## Environment\n\nSecrets are stored through Hatchery using OS keychain when available, with .env fallback.\n`,
    'HEARTBEAT.md': `# Parix Heartbeat\n\n## Background Routines\n\n- Keep Atrium, Hands, and Aegis health visible.\n- Run enabled cron tasks from Hatchery.\n- Distill daily memory into MEMORY.md after meaningful sessions.\n- Surface setup gaps without blocking normal work.\n- Spin up enabled worker modules lazily when a task needs them.\n\n## Idle Behavior\n\nWhen idle, Parix may perform safe checks, summarize logs, or prepare suggested fixes. Destructive actions still require the configured approval policy.\n`,
    'MEMORY.md': `# Parix Memory\n\n## Standing Facts\n\n- Operator: ${userName || 'unknown'}\n- Agent: ${agentName}\n- Mode: ${profile.mode}\n- Main workflows: ${getWorkflows(profile)}\n- Memory boundaries: ${getMemoryBoundaries(profile)}\n\n## Ongoing Projects\n\n- Parix Atrium/Hatchery/Aegis setup\n\n## Critical Constraints\n\n- Aegis is the default voice channel.\n- Wake word: ${profile.channels.settings.aegis?.wakeWord ?? 'aegis'}\n- Approval required: ${approvalRules || 'none'}\n`,
    [`memory/${today}.md`]: `# Daily Memory - ${today}\n\n## Session Log\n\n- Hatchery initialized the Parix workspace markdown stack.\n\n## Distillation Queue\n\n- Move durable facts to MEMORY.md when sessions wrap.\n`,
    'checklists/critical-action.md': `# Critical Action Checklist\n\nUse before deployments, reboots, deletes, credential changes, or broad filesystem edits.\n\n- Confirm target system and scope.\n- Check reversibility and backup state.\n- Ask for confirmation when required by autonomy policy.\n- Execute smallest viable action.\n- Record result in audit/memory.\n`,
  };

  const written: string[] = [];
  const skipped: string[] = [];
  for (const [relativePath, content] of Object.entries(files)) {
    const path = resolve(root, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    if (existsSync(path)) {
      skipped.push(relativePath);
      continue;
    }
    writeFileSync(path, content, 'utf-8');
    written.push(relativePath);
  }

  mkdirSync(resolve(root, '.agents/skills'), { recursive: true });
  return { root, written, skipped };
}

function buildUserMarkdown(profile: ParixProfile): string {
  if (isPersonalProfile(profile)) {
    return `# User Profile\n\n- Name: ${profile.agentProfile.userName || 'unknown'}\n- Description: ${profile.agentProfile.userDescription || 'unspecified'}\n- Relationship to agent: ${profile.agentProfile.relationshipLabel || 'unspecified'}\n- Main goals: ${profile.agentProfile.primaryGoals.join(', ') || 'unspecified'}\n- Recurring tasks: ${profile.agentProfile.recurringTasks.join(', ') || 'none'}\n- Vibe: ${profile.agentProfile.vibe || 'unspecified'}\n- Approval required: ${profile.agentProfile.approvalRequiredActions.join(', ') || 'none'}\n- Blocked actions: ${profile.agentProfile.blockedActions.join(', ') || 'none'}\n`;
  }
  if (isEnterpriseProfile(profile)) {
    return `# User Profile\n\n- Company: ${profile.agentProfile.companyName || 'unknown'}\n- Team: ${profile.agentProfile.teamName || 'unspecified'}\n- Agent: ${profile.agentProfile.agentName}\n- Role: ${profile.agentProfile.roleTitle}\n- Reports to: ${profile.agentProfile.reportingTo || 'unspecified'}\n- Responsibilities: ${profile.agentProfile.responsibilities.join(', ') || 'unspecified'}\n- Automatic actions: ${profile.agentProfile.automaticActions.join(', ') || 'none'}\n- Approval required: ${profile.agentProfile.approvalRequiredActions.join(', ') || 'none'}\n- Blocked actions: ${profile.agentProfile.blockedActions.join(', ') || 'none'}\n- Audit logging: ${profile.agentProfile.auditLoggingEnabled ? 'enabled' : 'disabled'}\n`;
  }
  return '# User Profile\n\n- Name: unknown\n';
}

function getAgentName(profile: ParixProfile): string {
  if (isPersonalProfile(profile)) return profile.agentProfile.agentName || 'Parix';
  if (isEnterpriseProfile(profile)) return profile.agentProfile.agentName || 'Parix';
  return 'Parix';
}

function getUserName(profile: ParixProfile): string {
  if (isPersonalProfile(profile)) return profile.agentProfile.userName ?? '';
  if (isEnterpriseProfile(profile)) return profile.agentProfile.reportingTo || profile.agentProfile.companyName;
  return '';
}

function getRole(profile: ParixProfile): string {
  if (isEnterpriseProfile(profile)) return profile.agentProfile.roleTitle;
  if (isPersonalProfile(profile)) return profile.agentProfile.relationshipLabel || 'Personal proactive operator';
  return 'Personal proactive operator';
}

function getAutonomy(profile: ParixProfile): string {
  if (isPersonalProfile(profile)) return profile.agentProfile.approvalRequiredActions.join(', ') || profile.personality.autonomyLevel;
  if (isEnterpriseProfile(profile)) return profile.agentProfile.approvalRequiredActions.join(', ') || profile.personality.approvalPolicy;
  return 'safe-auto-fix';
}

function getWorkflows(profile: ParixProfile): string {
  if (isPersonalProfile(profile)) return profile.agentProfile.primaryGoals.join(', ') || 'unspecified';
  if (isEnterpriseProfile(profile)) return profile.agentProfile.responsibilities.join(', ') || 'unspecified';
  return 'unspecified';
}

function getApprovalRules(profile: ParixProfile): string {
  if (isPersonalProfile(profile)) return profile.agentProfile.approvalRequiredActions.join(', ');
  if (isEnterpriseProfile(profile)) return profile.agentProfile.approvalRequiredActions.join(', ');
  return '';
}

function getBlockedActions(profile: ParixProfile): string {
  if (isPersonalProfile(profile)) return profile.agentProfile.blockedActions.join(', ');
  if (isEnterpriseProfile(profile)) return profile.agentProfile.blockedActions.join(', ');
  return '';
}

function getVoice(profile: ParixProfile): string {
  if (isPersonalProfile(profile)) {
    return profile.agentProfile.personality || profile.agentProfile.vibe || 'Warm, direct, and capable.';
  }
  if (isEnterpriseProfile(profile)) {
    return `${profile.agentProfile.roleTitle}: ${profile.agentProfile.roleDescription || 'clear, official, and accountable'}`;
  }
  return 'Warm, direct, and capable.';
}

function getMemoryBoundaries(profile: ParixProfile): string {
  if (isPersonalProfile(profile)) {
    const prefs = profile.agentProfile.memoryPreferences;
    return [
      prefs.rememberUserPreferences ? 'user preferences' : null,
      prefs.rememberProjectContext ? 'project context' : null,
      prefs.rememberPersonalContext ? 'personal context' : null,
    ].filter(Boolean).join(', ') || 'none';
  }
  if (isEnterpriseProfile(profile)) {
    const boundaries = profile.agentProfile.memoryBoundaries;
    return [
      boundaries.companyMemory ? 'company memory' : null,
      boundaries.teamMemory ? 'team memory' : null,
      boundaries.customerDataMemory ? 'customer data memory' : null,
    ].filter(Boolean).join(', ') || 'none';
  }
  return 'none';
}

/**
 * Reset: delete profile.json + clear secrets.
 * Does NOT delete the database or audit log.
 */
export async function resetProfile(): Promise<void> {
  const parixHome = getParixHome();
  const profilePath = getProfilePath(parixHome);
  const authProfilesPath = getAuthProfilesPath();
  const authProfiles = readAuthProfiles();

  // Delete profile.json
  if (existsSync(profilePath)) {
    unlinkSync(profilePath);
    console.log('[HATCHERY] Deleted profile.json');
  }
  if (existsSync(authProfilesPath)) {
    unlinkSync(authProfilesPath);
    console.log('[HATCHERY] Deleted auth-profiles.json');
  }

  // Clear secrets
  await clearAllSecrets();
  for (const profile of authProfiles.profiles) {
    if (profile.secretRef) {
      await deleteSecret(profile.secretRef);
    }
  }
  console.log('[HATCHERY] Cleared stored secrets');
}

/**
 * Gather the list of secrets the TUI/Web UI should collect,
 * based on the current profile's LLM provider and channels.
 */
export function getRequiredSecrets(
  llm: LLMConfig,
  channels: ChannelConfig
): Array<{ key: string; label: string; masked: boolean }> {
  const secrets: Array<{ key: string; label: string; masked: boolean }> = [];

  // LLM API key
  const envKey = PROVIDER_ENV_KEYS[llm.provider];
  if (llm.authMethod === 'account_auth') {
    // Account auth stores provider profiles separately, not provider API keys.
  } else if (envKey && !envKey.endsWith('_URL')) {
    secrets.push({
      key: envKey,
      label: `${llm.provider} API key`,
      masked: true,
    });
  } else if (envKey?.endsWith('_URL')) {
    secrets.push({
      key: envKey,
      label: `${llm.provider} base URL`,
      masked: false,
    });
  }

  // Channel secrets
  if (channels.enabled.includes('telegram')) {
    secrets.push(
      { key: 'TELEGRAM_BOT_TOKEN', label: 'Telegram bot token', masked: true },
      { key: 'TELEGRAM_CHAT_ID', label: 'Telegram chat ID', masked: false }
    );
  }
  if (channels.enabled.includes('discord')) {
    secrets.push({
      key: 'DISCORD_BOT_TOKEN',
      label: 'Discord bot token',
      masked: true,
    });
  }
  if (channels.enabled.includes('slack')) {
    secrets.push({
      key: 'SLACK_BOT_TOKEN',
      label: 'Slack bot token',
      masked: true,
    });
  }
  if (channels.enabled.includes('microsoft-teams')) {
    secrets.push(
      { key: 'TEAMS_APP_ID', label: 'Microsoft Teams app ID', masked: false },
      { key: 'TEAMS_APP_PASSWORD', label: 'Microsoft Teams app password', masked: true },
      { key: 'TEAMS_TENANT_ID', label: 'Microsoft tenant ID', masked: false }
    );
  }
  if (channels.enabled.includes('google-chat')) {
    secrets.push({ key: 'GOOGLE_CHAT_WEBHOOK_URL', label: 'Google Chat webhook URL', masked: false });
  }
  if (channels.enabled.includes('whatsapp')) {
    secrets.push({ key: 'WHATSAPP_DEFAULT_JID', label: 'WhatsApp default JID', masked: false });
  }
  if (channels.enabled.includes('signal')) {
    secrets.push(
      { key: 'SIGNAL_ACCOUNT', label: 'Signal account', masked: false },
      { key: 'SIGNAL_DEFAULT_RECIPIENT', label: 'Signal default recipient', masked: false }
    );
  }
  if (channels.enabled.includes('matrix')) {
    secrets.push(
      { key: 'MATRIX_HOMESERVER_URL', label: 'Matrix homeserver URL', masked: false },
      { key: 'MATRIX_ACCESS_TOKEN', label: 'Matrix access token', masked: true },
      { key: 'MATRIX_DEFAULT_ROOM_ID', label: 'Matrix default room ID', masked: false }
    );
  }
  if (channels.enabled.includes('line')) {
    secrets.push(
      { key: 'LINE_CHANNEL_ACCESS_TOKEN', label: 'LINE channel access token', masked: true },
      { key: 'LINE_CHANNEL_SECRET', label: 'LINE channel secret', masked: true }
    );
  }
  if (channels.enabled.includes('feishu')) {
    secrets.push(
      { key: 'FEISHU_APP_ID', label: 'Feishu app ID', masked: false },
      { key: 'FEISHU_APP_SECRET', label: 'Feishu app secret', masked: true },
      { key: 'FEISHU_DEFAULT_CHAT_ID', label: 'Feishu default chat ID', masked: false }
    );
  }
  if (channels.enabled.includes('mattermost')) {
    secrets.push(
      { key: 'MATTERMOST_URL', label: 'Mattermost URL', masked: false },
      { key: 'MATTERMOST_BOT_TOKEN', label: 'Mattermost bot token', masked: true },
      { key: 'MATTERMOST_DEFAULT_CHANNEL_ID', label: 'Mattermost channel ID', masked: false }
    );
  }
  if (channels.enabled.includes('nextcloud-talk')) {
    secrets.push(
      { key: 'NEXTCLOUD_URL', label: 'Nextcloud URL', masked: false },
      { key: 'NEXTCLOUD_USERNAME', label: 'Nextcloud username', masked: false },
      { key: 'NEXTCLOUD_APP_PASSWORD', label: 'Nextcloud app password', masked: true },
      { key: 'NEXTCLOUD_TALK_TOKEN', label: 'Nextcloud Talk token', masked: true }
    );
  }
  if (channels.enabled.includes('irc')) {
    secrets.push(
      { key: 'IRC_SERVER', label: 'IRC server', masked: false },
      { key: 'IRC_NICK', label: 'IRC nick', masked: false },
      { key: 'IRC_CHANNELS', label: 'IRC channels', masked: false }
    );
  }
  if (channels.enabled.includes('nostr')) {
    secrets.push(
      { key: 'NOSTR_PRIVATE_KEY', label: 'Nostr private key', masked: true },
      { key: 'NOSTR_RELAYS', label: 'Nostr relays', masked: false }
    );
  }
  if (channels.enabled.includes('synology-chat')) {
    secrets.push({ key: 'SYNOLOGY_CHAT_WEBHOOK_URL', label: 'Synology Chat webhook URL', masked: false });
  }
  if (channels.enabled.includes('tlon')) {
    secrets.push(
      { key: 'TLON_SHIP_URL', label: 'Tlon ship URL', masked: false },
      { key: 'TLON_CODE', label: 'Tlon code', masked: true }
    );
  }
  if (channels.enabled.includes('twitch')) {
    secrets.push(
      { key: 'TWITCH_BOT_USERNAME', label: 'Twitch bot username', masked: false },
      { key: 'TWITCH_OAUTH_TOKEN', label: 'Twitch OAuth token', masked: true },
      { key: 'TWITCH_CHANNEL', label: 'Twitch channel', masked: false }
    );
  }
  if (channels.enabled.includes('webchat')) {
    secrets.push({ key: 'WEBCHAT_SHARED_SECRET', label: 'WebChat shared secret', masked: true });
  }
  if (channels.enabled.includes('imessage')) {
    secrets.push(
      { key: 'IMSG_BRIDGE_URL', label: 'iMessage bridge URL', masked: false },
      { key: 'IMSG_BRIDGE_TOKEN', label: 'iMessage bridge token', masked: true },
      { key: 'IMSG_DEFAULT_CHAT', label: 'iMessage default chat', masked: false }
    );
  }
  if (channels.enabled.includes('voice-call')) {
    secrets.push(
      { key: 'VOICE_PROVIDER', label: 'Voice provider (twilio/plivo)', masked: false },
      { key: 'VOICE_DEFAULT_TO_NUMBER', label: 'Default phone number', masked: false }
    );
  }
  if (channels.enabled.includes('wechat')) {
    secrets.push({ key: 'WECHAT_DEFAULT_USER_ID', label: 'WeChat default user ID', masked: false });
  }
  if (channels.enabled.includes('qq-bot')) {
    secrets.push(
      { key: 'QQ_BOT_APP_ID', label: 'QQ bot app ID', masked: false },
      { key: 'QQ_BOT_TOKEN', label: 'QQ bot token', masked: true },
      { key: 'QQ_BOT_SECRET', label: 'QQ bot secret', masked: true }
    );
  }
  if (channels.enabled.includes('yuanbao')) {
    secrets.push(
      { key: 'YUANBAO_PLUGIN_URL', label: 'Yuanbao plugin URL', masked: false },
      { key: 'YUANBAO_TOKEN', label: 'Yuanbao token', masked: true }
    );
  }
  if (channels.enabled.includes('zalo')) {
    secrets.push(
      { key: 'ZALO_APP_ID', label: 'Zalo app ID', masked: false },
      { key: 'ZALO_APP_SECRET', label: 'Zalo app secret', masked: true },
      { key: 'ZALO_ACCESS_TOKEN', label: 'Zalo access token', masked: true }
    );
  }
  if (channels.enabled.includes('zalo-personal')) {
    secrets.push({ key: 'ZALO_PERSONAL_DEFAULT_THREAD_ID', label: 'Zalo Personal default thread ID', masked: false });
  }
  if (channels.enabled.includes('webhook')) {
    secrets.push({
      key: 'PARIX_WEBHOOK_URL',
      label: 'Webhook URL',
      masked: false,
    });
  }

  return secrets;
}
