/**
 * Hatchery Schema — Single source of truth for Parix onboarding config.
 *
 * Consumed by:
 *   - Atrium (TypeScript) — profile loading + subsystem wiring
 *   - Hatchery (TypeScript) — TUI + config writer
 *   - Aegis (React)         — onboarding page + profile display
 *   - Hands (Python)        — reads profile.json directly
 *
 * Secrets (API keys, bot tokens) are NEVER stored in profile.json.
 * They go to: keytar (primary) → .env (fallback) → env vars (override).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";

// ─── Mode ────────────────────────────────────────────────────────────

export type ProfileMode = "personal" | "enterprise";

// ─── Section 1: Identity ─────────────────────────────────────────────

export interface PersonalIdentity {
  name: string;
  computerUse: string;
  mainWorkflows: string[];
}

export interface EnterpriseIdentity {
  companyName: string;
  industry: string;
  department: string;
  userRole: string;
  allowedScope: string[];
  forbiddenScope: string[];
}

export type ProfileIdentity = PersonalIdentity | EnterpriseIdentity;

// ─── Section 2: LLM ─────────────────────────────────────────────────

export const LLM_PROVIDERS = [
  "openai",
  "anthropic",
  "groq",
  "grok",
  "mistral",
  "kimi",
  "google",
  "openrouter",
  "ollama",
  "lmstudio",
] as const;

export type LLMProvider = (typeof LLM_PROVIDERS)[number];

export type LLMAuthMethod = "api_key" | "account_auth" | "local";
export type LLMAuthStatus = "configured" | "pending" | "unavailable";

export interface LLMAuthProfile {
  id: string;
  provider: LLMProvider | string;
  method: LLMAuthMethod;
  status: LLMAuthStatus;
  label: string;
  secretRef?: string;
  accountLabel?: string;
  instructions?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LLMProviderCapability {
  id: string;
  name: string;
  supportedAuthMethods: LLMAuthMethod[];
  defaultAuthMethod: LLMAuthMethod;
  accountAuthLabel?: string;
  accountAuthInstructions?: string;
}

export interface LLMConfig {
  provider: LLMProvider | string;
  model: string;
  authMethod: LLMAuthMethod;
  authProfileId: string | null;
  connectionVerified: boolean;
  verifiedAt: string | null;
}

/** Provider → recommended default model */
export const DEFAULT_MODELS: Record<string, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-sonnet-4-20250514",
  groq: "llama-3.3-70b-versatile",
  grok: "grok-3-mini",
  google: "gemini-1.5-flash",
  mistral: "mistral-small-latest",
  kimi: "kimi-k2-0711-preview",
  openrouter: "openai/gpt-4o-mini",
  ollama: "llama3.2",
  lmstudio: "local",
};

/** Provider → env var that holds the API key */
export const PROVIDER_ENV_KEYS: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  groq: "GROQ_API_KEY",
  grok: "XAI_API_KEY",
  mistral: "MISTRAL_API_KEY",
  kimi: "KIMI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  ollama: "OLLAMA_BASE_URL",
  lmstudio: "LMSTUDIO_BASE_URL",
};

export const LLM_PROVIDER_CAPABILITIES: Record<string, LLMProviderCapability> =
  {
    openai: {
      id: "openai",
      name: "OpenAI / ChatGPT / Codex",
      supportedAuthMethods: ["account_auth", "api_key"],
      defaultAuthMethod: "account_auth",
      accountAuthLabel: "OpenAI account / ChatGPT Codex auth",
      accountAuthInstructions:
        "Sign in through the official OpenAI/Codex account flow on this machine, then Parix will use the saved account-auth profile for OpenAI agent models.",
    },
    anthropic: {
      id: "anthropic",
      name: "Anthropic",
      supportedAuthMethods: ["account_auth", "api_key"],
      defaultAuthMethod: "api_key",
      accountAuthLabel: "Claude account / CLI auth",
      accountAuthInstructions:
        "Sign in with the official Claude CLI on this machine, then Parix can reference that local account-auth profile where supported.",
    },
    groq: {
      id: "groq",
      name: "Groq",
      supportedAuthMethods: ["account_auth", "api_key"],
      defaultAuthMethod: "account_auth",
      accountAuthLabel: "Groq account auth",
      accountAuthInstructions:
        "Sign in to GroqCloud and link the resulting account profile where supported. API key setup remains available for server use.",
    },
    grok: {
      id: "grok",
      name: "xAI Grok",
      supportedAuthMethods: ["account_auth", "api_key"],
      defaultAuthMethod: "account_auth",
      accountAuthLabel: "xAI account auth",
      accountAuthInstructions:
        "Sign in to xAI for Grok access where account linking is available. Use XAI_API_KEY when direct API credentials are required.",
    },
    google: {
      id: "google",
      name: "Google Gemini",
      supportedAuthMethods: ["api_key"],
      defaultAuthMethod: "api_key",
    },
    mistral: {
      id: "mistral",
      name: "Mistral / Codestral",
      supportedAuthMethods: ["account_auth", "api_key"],
      defaultAuthMethod: "account_auth",
      accountAuthLabel: "Mistral account auth",
      accountAuthInstructions:
        "Sign in to Mistral La Plateforme and link the account profile where supported. Use a Mistral API key for predictable gateway/server use.",
    },
    kimi: {
      id: "kimi",
      name: "Kimi",
      supportedAuthMethods: ["account_auth", "api_key"],
      defaultAuthMethod: "account_auth",
      accountAuthLabel: "Kimi account auth",
      accountAuthInstructions:
        "Sign in to Kimi/Moonshot and link the account profile where supported. API key setup remains available for API access.",
    },
    openrouter: {
      id: "openrouter",
      name: "OpenRouter",
      supportedAuthMethods: ["account_auth", "api_key"],
      defaultAuthMethod: "account_auth",
      accountAuthLabel: "OpenRouter account auth",
      accountAuthInstructions:
        "Sign in to OpenRouter and link your account profile where supported. API key setup remains available and is usually best for long-running services.",
    },
    ollama: {
      id: "ollama",
      name: "Ollama",
      supportedAuthMethods: ["local"],
      defaultAuthMethod: "local",
      accountAuthLabel: "Local Ollama runtime",
      accountAuthInstructions:
        "Ollama runs locally. Parix links to your local Ollama endpoint instead of a cloud account.",
    },
    lmstudio: {
      id: "lmstudio",
      name: "LM Studio",
      supportedAuthMethods: ["local"],
      defaultAuthMethod: "local",
      accountAuthLabel: "Local LM Studio runtime",
      accountAuthInstructions:
        "LM Studio runs locally. Parix links to your local OpenAI-compatible LM Studio endpoint instead of a cloud account.",
    },
  };

// ─── Section 3: Channels ────────────────────────────────────────────

export const CHANNEL_IDS = [
  "desktop",
  "aegis",
  "webhook",
  "telegram",
  "discord",
  "slack",
  "microsoft-teams",
  "google-chat",
  "whatsapp",
  "signal",
  "matrix",
  "line",
  "feishu",
  "mattermost",
  "nextcloud-talk",
  "irc",
  "nostr",
  "synology-chat",
  "tlon",
  "twitch",
  "webchat",
  "imessage",
  "voice-call",
  "wechat",
  "qq-bot",
  "yuanbao",
  "zalo",
  "zalo-personal",
] as const;

export type ChannelId = (typeof CHANNEL_IDS)[number];

export interface ChannelConfig {
  primary: ChannelId | string;
  enabled: string[];
  settings: Record<string, Record<string, string>>;
}

export interface AegisVoiceSettings extends Record<string, string> {
  kind: "voice";
  enabled: "true";
  autoStart: "true";
  wakeWord: string;
}

export const DEFAULT_AEGIS_WAKE_WORD = "aegis";

export function createDefaultAegisSettings(
  wakeWord = DEFAULT_AEGIS_WAKE_WORD,
): AegisVoiceSettings {
  return {
    kind: "voice",
    enabled: "true",
    autoStart: "true",
    wakeWord,
  };
}

// ─── Section 4: Permissions ─────────────────────────────────────────

export interface PermissionsConfig {
  terminalErrors: boolean;
  activeWindow: boolean;
  gitState: boolean;
  clipboardDetection: boolean;
  browserTabs: boolean;
  systemHealth: boolean;
}

export const PERSONAL_DEFAULTS: PermissionsConfig = {
  terminalErrors: true,
  activeWindow: true,
  gitState: true,
  clipboardDetection: false,
  browserTabs: false,
  systemHealth: true,
};

export const ENTERPRISE_DEFAULTS: PermissionsConfig = {
  terminalErrors: true,
  activeWindow: false,
  gitState: true,
  clipboardDetection: false,
  browserTabs: false,
  systemHealth: true,
};

// ─── Section 5: Personality ─────────────────────────────────────────

export type StyleOption = "concise" | "friendly" | "technical" | "casual";
export type VibeOption = "proactive" | "cautious" | "balanced";
export type InterruptionLevel = "minimal" | "moderate" | "aggressive";
export type AutonomyLevel = "ask-before-fix" | "safe-auto-fix" | "full-auto";

export interface PersonalPersonality {
  agentName: string;
  style: StyleOption;
  vibe: VibeOption;
  interruptionLevel: InterruptionLevel;
  autonomyLevel: AutonomyLevel;
}

export type EscalationStyle = "immediate" | "batch" | "threshold";
export type ApprovalPolicy = "always-ask" | "safe-auto" | "policy-based";
export type SafetyBoundary = "strict" | "moderate";
export type AuditExpectation = "full" | "actions-only" | "exceptions-only";

export interface EnterprisePersonality {
  roleName: string;
  escalationStyle: EscalationStyle;
  approvalPolicy: ApprovalPolicy;
  safetyBoundary: SafetyBoundary;
  auditExpectation: AuditExpectation;
}

export type ProfilePersonality = PersonalPersonality | EnterprisePersonality;

export interface PersonalAgentProfile {
  mode: "personal";
  userName?: string;
  userDescription?: string;
  agentName: string;
  relationshipLabel?: string;
  vibe?: string;
  personality?: string;
  primaryGoals: string[];
  recurringTasks: string[];
  techStack?: string;
  proactivity?: "reactive" | "balanced" | "proactive";
  tone?: "professional" | "friendly" | "candid" | "philosophical";
  mainMission?: string;
  allowedChannels: string[];
  blockedActions: string[];
  approvalRequiredActions: string[];
  memoryPreferences: {
    rememberUserPreferences: boolean;
    rememberProjectContext: boolean;
    rememberPersonalContext: boolean;
  };
}

export interface EnterpriseAgentProfile {
  mode: "enterprise";
  companyName: string;
  teamName?: string;
  agentName: string;
  roleTitle: string;
  roleDescription: string;
  responsibilities: string[];
  recurringTasks: string[];
  techStack?: string;
  proactivity?: "reactive" | "balanced" | "proactive";
  tone?: "professional" | "friendly" | "candid" | "philosophical";
  mainMission?: string;
  reportingTo?: string;
  allowedChannels: string[];
  allowedTools: string[];
  automaticActions: string[];
  blockedActions: string[];
  approvalRequiredActions: string[];
  auditLoggingEnabled: boolean;
  memoryBoundaries: {
    companyMemory: boolean;
    teamMemory: boolean;
    customerDataMemory: boolean;
  };
}

export type AgentProfile = PersonalAgentProfile | EnterpriseAgentProfile;

export const HATCHERY_MODULES = [
  {
    id: "llm-router",
    label: "LLM router",
    defaultPersonal: true,
    defaultEnterprise: true,
  },
  {
    id: "channel-router",
    label: "Channel router",
    defaultPersonal: true,
    defaultEnterprise: true,
  },
  {
    id: "approval-gate",
    label: "Approval gate",
    defaultPersonal: true,
    defaultEnterprise: true,
  },
  {
    id: "aegis-relay",
    label: "Aegis relay",
    defaultPersonal: true,
    defaultEnterprise: true,
  },
  {
    id: "terminal-error-watcher",
    label: "Terminal error watcher",
    defaultPersonal: true,
    defaultEnterprise: true,
  },
  {
    id: "active-window-watcher",
    label: "Active window watcher",
    defaultPersonal: true,
    defaultEnterprise: false,
  },
  {
    id: "git-state-watcher",
    label: "Git state watcher",
    defaultPersonal: true,
    defaultEnterprise: true,
  },
  {
    id: "system-health-monitor",
    label: "System health monitor",
    defaultPersonal: true,
    defaultEnterprise: true,
  },
  {
    id: "clipboard-watcher",
    label: "Clipboard watcher",
    defaultPersonal: false,
    defaultEnterprise: false,
  },
  {
    id: "browser-tab-watcher",
    label: "Browser tab watcher",
    defaultPersonal: false,
    defaultEnterprise: false,
  },
  {
    id: "vision-snapshot",
    label: "Vision snapshot worker",
    defaultPersonal: false,
    defaultEnterprise: false,
  },
  {
    id: "cli-executor",
    label: "CLI executor",
    defaultPersonal: true,
    defaultEnterprise: true,
  },
  {
    id: "audit-logger",
    label: "Audit logger",
    defaultPersonal: false,
    defaultEnterprise: true,
  },
] as const;

export type HatcheryModuleId = (typeof HATCHERY_MODULES)[number]["id"];

export interface HatcheryModuleConfig {
  enabled: string[];
  lazyLoad: true;
  configuredAt: string | null;
}

// ─── Full Profile ────────────────────────────────────────────────────

// ─── Section: Telemetry (v1.0 — opt-in only) ─────────────────────────
//
// Telemetry is OFF by default in every fresh profile. Hatchery's
// onboarding TUI asks once during setup; the answer goes here. There is
// no implicit consent and no telemetry runs until `enabled` is true and
// `consentedAt` is a real ISO timestamp.
//
// What gets sent when enabled: see docs/privacy.md. The short version
// is anonymous crash reports + version + OS family. No user content,
// no prompts, no LLM responses, no channel messages.

export interface TelemetryConfig {
  enabled: boolean;
  consentedAt: string | null;
  endpoint?: string;
}

// ─── Section: Update channel (v1.0) ──────────────────────────────────
//
// Client-side state for the auto-update checker (see
// `atrium/src/updates/checker.ts`). `endpoint` is the host we poll;
// `channel` is the release track (`stable` for most users, `beta` for
// dogfooders). `pollIntervalMs` is the cadence; the checker also
// always polls once at startup regardless of `lastCheckedAt`.

export type UpdateChannel = "stable" | "beta";

export interface UpdatesConfig {
  channel: UpdateChannel;
  endpoint: string;
  pollIntervalMs: number;
  lastCheckedAt: string | null;
  autoCheck: boolean;
}

// ─── Section: Autonomy / skill-permission policy ─────────────────────
//
// Controls whether the agent prompts before running skills that need
// permissions outside the first-party allowlist. Off by default — the
// E3a audit blocker only relaxes when the user explicitly opts in.
//
// `autonomousMode = true` does NOT disable the Constitution or autonomy
// thresholds; it only skips the runner-level skill permission gate for
// third-party skills the user has installed.
export interface AutonomyConfig {
  autonomousMode: boolean;
  enabledAt: string | null;
}

export interface ParixProfile {
  version: "1.0";
  mode: ProfileMode;
  createdAt: string;
  updatedAt: string;
  identity: ProfileIdentity;
  llm: LLMConfig;
  channels: ChannelConfig;
  permissions: PermissionsConfig;
  personality: ProfilePersonality;
  agentProfile: AgentProfile;
  hatcheryModules: HatcheryModuleConfig;
  telemetry?: TelemetryConfig;
  updates?: UpdatesConfig;
  autonomy?: AutonomyConfig;
}

export const DEFAULT_UPDATE_ENDPOINT = "https://updates.parix.dev";
export const DEFAULT_UPDATE_POLL_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function createDefaultTelemetry(): TelemetryConfig {
  return {
    enabled: false,
    consentedAt: null,
  };
}

export function createDefaultUpdates(): UpdatesConfig {
  return {
    channel: "stable",
    endpoint: DEFAULT_UPDATE_ENDPOINT,
    pollIntervalMs: DEFAULT_UPDATE_POLL_INTERVAL_MS,
    lastCheckedAt: null,
    autoCheck: true,
  };
}

export function createDefaultAutonomy(): AutonomyConfig {
  return {
    autonomousMode: false,
    enabledAt: null,
  };
}

// ─── Defaults ────────────────────────────────────────────────────────

export function createDefaultProfile(mode: ProfileMode): ParixProfile {
  const now = new Date().toISOString();

  const identity: ProfileIdentity =
    mode === "personal"
      ? { name: "", computerUse: "", mainWorkflows: [] }
      : {
          companyName: "",
          industry: "",
          department: "",
          userRole: "",
          allowedScope: [],
          forbiddenScope: [],
        };

  const personality: ProfilePersonality =
    mode === "personal"
      ? {
          agentName: "Parix",
          style: "friendly" as StyleOption,
          vibe: "balanced" as VibeOption,
          interruptionLevel: "moderate" as InterruptionLevel,
          autonomyLevel: "safe-auto-fix" as AutonomyLevel,
        }
      : {
          roleName: "IT Support Agent",
          escalationStyle: "threshold" as EscalationStyle,
          approvalPolicy: "always-ask" as ApprovalPolicy,
          safetyBoundary: "strict" as SafetyBoundary,
          auditExpectation: "full" as AuditExpectation,
        };

  return {
    version: "1.0",
    mode,
    createdAt: now,
    updatedAt: now,
    identity,
    llm: {
      provider: "none",
      model: "none",
      authMethod: "api_key",
      authProfileId: null,
      connectionVerified: false,
      verifiedAt: null,
    },
    channels: {
      primary: "none",
      enabled: ["aegis"],
      settings: {
        aegis: createDefaultAegisSettings(),
      },
    },
    permissions:
      mode === "personal"
        ? { ...PERSONAL_DEFAULTS }
        : { ...ENTERPRISE_DEFAULTS },
    personality,
    agentProfile: createDefaultAgentProfile(mode),
    hatcheryModules: createDefaultHatcheryModules(mode),
    telemetry: createDefaultTelemetry(),
    updates: createDefaultUpdates(),
    autonomy: createDefaultAutonomy(),
  };
}

// ─── Type Guards ─────────────────────────────────────────────────────

export function createDefaultAgentProfile(mode: ProfileMode): AgentProfile {
  if (mode === "personal") {
    return {
      mode,
      userName: "",
      userDescription: "",
      agentName: "Parix",
      relationshipLabel: "",
      vibe: "warm, capable, proactive",
      personality: "Friendly, direct, and useful without being pushy.",
      primaryGoals: [
        "help with daily computer work",
        "spot errors",
        "suggest safe fixes",
      ],
      recurringTasks: [],
      allowedChannels: ["aegis"],
      blockedActions: [
        "impersonate the user",
        "spend money",
        "delete personal data without approval",
      ],
      approvalRequiredActions: [
        "send external messages",
        "delete data",
        "change credentials",
        "spend money",
        "run destructive commands",
      ],
      memoryPreferences: {
        rememberUserPreferences: true,
        rememberProjectContext: true,
        rememberPersonalContext: false,
      },
    };
  }

  return {
    mode,
    companyName: "",
    teamName: "",
    agentName: "Parix",
    roleTitle: "IT Support Agent",
    roleDescription:
      "Digital co-worker that identifies as Parix and works through approved company integrations.",
    responsibilities: ["monitor configured systems", "surface actionable fixes"],
    recurringTasks: [],
    reportingTo: "",
    allowedChannels: ["aegis"],
    allowedTools: [],
    automaticActions: ["local diagnostics", "status summaries"],
    blockedActions: [
      "impersonate a human employee",
      "use unofficial channel access",
      "send external messages without approval",
      "delete data without approval",
      "spend money without approval",
      "change production systems without approval",
    ],
    approvalRequiredActions: [
      "send external messages",
      "delete data",
      "spend money",
      "change production systems",
      "modify customer data",
    ],
    auditLoggingEnabled: true,
    memoryBoundaries: {
      companyMemory: true,
      teamMemory: true,
      customerDataMemory: false,
    },
  };
}

export function createDefaultHatcheryModules(
  mode: ProfileMode,
): HatcheryModuleConfig {
  return {
    enabled: HATCHERY_MODULES.filter((module) =>
      mode === "personal" ? module.defaultPersonal : module.defaultEnterprise,
    ).map((module) => module.id),
    lazyLoad: true,
    configuredAt: null,
  };
}

export function isPersonalProfile(
  profile: ParixProfile,
): profile is ParixProfile & {
  identity: PersonalIdentity;
  personality: PersonalPersonality;
  agentProfile: PersonalAgentProfile;
} {
  return profile.mode === "personal";
}

export function isEnterpriseProfile(
  profile: ParixProfile,
): profile is ParixProfile & {
  identity: EnterpriseIdentity;
  personality: EnterprisePersonality;
  agentProfile: EnterpriseAgentProfile;
} {
  return profile.mode === "enterprise";
}

// ─── Validation ──────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateProfile(data: unknown): ValidationResult {
  const errors: string[] = [];

  if (!data || typeof data !== "object") {
    return { valid: false, errors: ["Profile must be a non-null object"] };
  }

  const p = data as Record<string, unknown>;

  // Version
  if (p.version !== "1.0") {
    errors.push(`Unsupported profile version: ${p.version}`);
  }

  // Mode
  if (p.mode !== "personal" && p.mode !== "enterprise") {
    errors.push(`Invalid mode: ${p.mode} (must be personal or enterprise)`);
  }

  // Timestamps
  if (typeof p.createdAt !== "string") errors.push("Missing createdAt");
  if (typeof p.updatedAt !== "string") errors.push("Missing updatedAt");

  // Identity
  if (!p.identity || typeof p.identity !== "object") {
    errors.push("Missing identity section");
  } else if (p.mode === "personal") {
    const id = p.identity as Record<string, unknown>;
    if (typeof id.name !== "string")
      errors.push("identity.name must be a string");
  } else if (p.mode === "enterprise") {
    const id = p.identity as Record<string, unknown>;
    if (typeof id.companyName !== "string")
      errors.push("identity.companyName must be a string");
    if (typeof id.userRole !== "string")
      errors.push("identity.userRole must be a string");
  }

  // LLM
  if (!p.llm || typeof p.llm !== "object") {
    errors.push("Missing llm section");
  } else {
    const llm = p.llm as Record<string, unknown>;
    if (typeof llm.provider !== "string")
      errors.push("llm.provider must be a string");
    if (typeof llm.model !== "string")
      errors.push("llm.model must be a string");
    if (
      llm.authMethod !== undefined &&
      llm.authMethod !== "api_key" &&
      llm.authMethod !== "account_auth" &&
      llm.authMethod !== "local"
    ) {
      errors.push("llm.authMethod must be api_key, account_auth, or local");
    }
    if (
      llm.authProfileId !== undefined &&
      llm.authProfileId !== null &&
      typeof llm.authProfileId !== "string"
    ) {
      errors.push("llm.authProfileId must be a string or null");
    }
  }

  // Channels
  if (!p.channels || typeof p.channels !== "object") {
    errors.push("Missing channels section");
  } else {
    const ch = p.channels as Record<string, unknown>;
    if (typeof ch.primary !== "string")
      errors.push("channels.primary must be a string");
    if (!Array.isArray(ch.enabled))
      errors.push("channels.enabled must be an array");
    if (Array.isArray(ch.enabled) && !ch.enabled.includes("aegis")) {
      errors.push("channels.enabled must include aegis");
    }
    if (
      ch.settings !== undefined &&
      (typeof ch.settings !== "object" || ch.settings === null)
    ) {
      errors.push("channels.settings must be an object");
    }
    const settings = ch.settings as Record<string, unknown> | undefined;
    const aegis = settings?.aegis as Record<string, unknown> | undefined;
    if (aegis) {
      if (aegis.kind !== "voice")
        errors.push("channels.settings.aegis.kind must be voice");
      if (
        typeof aegis.wakeWord !== "string" ||
        aegis.wakeWord.trim().length === 0
      ) {
        errors.push(
          "channels.settings.aegis.wakeWord must be a non-empty string",
        );
      }
    }
  }

  // Permissions
  if (!p.permissions || typeof p.permissions !== "object") {
    errors.push("Missing permissions section");
  } else {
    const perm = p.permissions as Record<string, unknown>;
    const boolKeys: Array<keyof PermissionsConfig> = [
      "terminalErrors",
      "activeWindow",
      "gitState",
      "clipboardDetection",
      "browserTabs",
      "systemHealth",
    ];
    for (const key of boolKeys) {
      if (typeof perm[key] !== "boolean") {
        errors.push(`permissions.${key} must be a boolean`);
      }
    }
  }

  // Personality
  if (!p.personality || typeof p.personality !== "object") {
    errors.push("Missing personality section");
  }

  // Agent profile
  if (!p.agentProfile || typeof p.agentProfile !== "object") {
    errors.push("Missing agentProfile section");
  } else if (p.mode === "personal") {
    validatePersonalAgentProfile(
      p.agentProfile as Record<string, unknown>,
      errors,
    );
  } else if (p.mode === "enterprise") {
    validateEnterpriseAgentProfile(
      p.agentProfile as Record<string, unknown>,
      errors,
    );
  }

  // Hatchery modules
  if (!p.hatcheryModules || typeof p.hatcheryModules !== "object") {
    errors.push("Missing hatcheryModules section");
  } else {
    const modules = p.hatcheryModules as Record<string, unknown>;
    if (!isStringArray(modules.enabled)) {
      errors.push("hatcheryModules.enabled must be an array of strings");
    } else {
      const knownModules = new Set<string>(
        HATCHERY_MODULES.map((module) => module.id),
      );
      for (const moduleId of modules.enabled) {
        if (!knownModules.has(moduleId)) {
          errors.push(`hatcheryModules.enabled contains unknown module: ${moduleId}`);
        }
      }
    }
    if (modules.lazyLoad !== true) {
      errors.push("hatcheryModules.lazyLoad must be true");
    }
    if (
      modules.configuredAt !== null &&
      modules.configuredAt !== undefined &&
      typeof modules.configuredAt !== "string"
    ) {
      errors.push("hatcheryModules.configuredAt must be a string or null");
    }
  }

  // Telemetry (optional — fresh profiles have it; older profiles may not)
  if (p.telemetry !== undefined) {
    if (typeof p.telemetry !== "object" || p.telemetry === null) {
      errors.push("telemetry must be an object");
    } else {
      const tel = p.telemetry as Record<string, unknown>;
      if (typeof tel.enabled !== "boolean") {
        errors.push("telemetry.enabled must be a boolean");
      }
      if (tel.consentedAt !== null && typeof tel.consentedAt !== "string") {
        errors.push("telemetry.consentedAt must be a string or null");
      }
      if (tel.enabled === true && tel.consentedAt === null) {
        errors.push(
          "telemetry.enabled cannot be true without a consentedAt timestamp",
        );
      }
    }
  }

  // Updates (optional)
  if (p.updates !== undefined) {
    if (typeof p.updates !== "object" || p.updates === null) {
      errors.push("updates must be an object");
    } else {
      const up = p.updates as Record<string, unknown>;
      if (up.channel !== "stable" && up.channel !== "beta") {
        errors.push("updates.channel must be stable or beta");
      }
      if (typeof up.endpoint !== "string" || !up.endpoint) {
        errors.push("updates.endpoint must be a non-empty string");
      }
      if (typeof up.pollIntervalMs !== "number" || up.pollIntervalMs < 60_000) {
        errors.push(
          "updates.pollIntervalMs must be a number >= 60000 (1 minute)",
        );
      }
      if (up.lastCheckedAt !== null && typeof up.lastCheckedAt !== "string") {
        errors.push("updates.lastCheckedAt must be a string or null");
      }
      if (typeof up.autoCheck !== "boolean") {
        errors.push("updates.autoCheck must be a boolean");
      }
    }
  }

  // Autonomy (optional — older profiles may not have it)
  if (p.autonomy !== undefined) {
    if (typeof p.autonomy !== "object" || p.autonomy === null) {
      errors.push("autonomy must be an object");
    } else {
      const au = p.autonomy as Record<string, unknown>;
      if (typeof au.autonomousMode !== "boolean") {
        errors.push("autonomy.autonomousMode must be a boolean");
      }
      if (au.enabledAt !== null && typeof au.enabledAt !== "string") {
        errors.push("autonomy.enabledAt must be a string or null");
      }
      // Mirrors telemetry's consent invariant: can't be on without a timestamp.
      if (au.autonomousMode === true && au.enabledAt === null) {
        errors.push(
          "autonomy.autonomousMode cannot be true without an enabledAt timestamp",
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function validatePersonalAgentProfile(
  profile: Record<string, unknown>,
  errors: string[],
): void {
  if (profile.mode !== "personal")
    errors.push("agentProfile.mode must be personal");
  if (typeof profile.agentName !== "string")
    errors.push("agentProfile.agentName must be a string");
  for (const key of [
    "primaryGoals",
    "recurringTasks",
    "allowedChannels",
    "blockedActions",
    "approvalRequiredActions",
  ]) {
    if (!isStringArray(profile[key])) {
      errors.push(`agentProfile.${key} must be an array of strings`);
    }
  }
  validateBooleanRecord(
    profile.memoryPreferences,
    [
      "rememberUserPreferences",
      "rememberProjectContext",
      "rememberPersonalContext",
    ],
    "agentProfile.memoryPreferences",
    errors,
  );
}

function validateEnterpriseAgentProfile(
  profile: Record<string, unknown>,
  errors: string[],
): void {
  if (profile.mode !== "enterprise")
    errors.push("agentProfile.mode must be enterprise");
  for (const key of [
    "companyName",
    "agentName",
    "roleTitle",
    "roleDescription",
  ]) {
    if (typeof profile[key] !== "string") {
      errors.push(`agentProfile.${key} must be a string`);
    }
  }
  for (const key of [
    "responsibilities",
    "recurringTasks",
    "allowedChannels",
    "allowedTools",
    "automaticActions",
    "blockedActions",
    "approvalRequiredActions",
  ]) {
    if (!isStringArray(profile[key])) {
      errors.push(`agentProfile.${key} must be an array of strings`);
    }
  }
  if (profile.auditLoggingEnabled !== true) {
    errors.push("agentProfile.auditLoggingEnabled must be true");
  }
  validateBooleanRecord(
    profile.memoryBoundaries,
    ["companyMemory", "teamMemory", "customerDataMemory"],
    "agentProfile.memoryBoundaries",
    errors,
  );
}

function validateBooleanRecord(
  value: unknown,
  keys: string[],
  path: string,
  errors: string[],
): void {
  if (!value || typeof value !== "object") {
    errors.push(`${path} must be an object`);
    return;
  }
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    if (typeof record[key] !== "boolean") {
      errors.push(`${path}.${key} must be a boolean`);
    }
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

// ─── File I/O ────────────────────────────────────────────────────────

/** Resolve the profile.json path for the current PARIX_HOME */
export function getProfilePath(parixHome?: string): string {
  const home =
    parixHome ||
    process.env.PARIX_HOME ||
    resolve(process.env.HOME || process.env.USERPROFILE || "", ".parix");
  return resolve(home, "profile.json");
}

/** Load profile from disk. Returns null if missing or invalid. */
export function loadProfile(parixHome?: string): ParixProfile | null {
  const path = getProfilePath(parixHome);
  if (!existsSync(path)) return null;

  try {
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    const result = validateProfile(raw);
    if (!result.valid) {
      console.error(
        "[HATCHERY] Invalid profile.json:",
        result.errors.join(", "),
      );
      return null;
    }
    return raw as ParixProfile;
  } catch (err) {
    console.error(
      "[HATCHERY] Failed to load profile.json:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/** Save profile to disk. Validates before writing. */
export function saveProfile(
  profile: ParixProfile,
  parixHome?: string,
): boolean {
  profile.updatedAt = new Date().toISOString();

  const result = validateProfile(profile);
  if (!result.valid) {
    console.error(
      "[HATCHERY] Cannot save invalid profile:",
      result.errors.join(", "),
    );
    return false;
  }

  const path = getProfilePath(parixHome);

  // Ensure parent directory exists
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });

  writeFileSync(path, JSON.stringify(profile, null, 2) + "\n", "utf-8");
  return true;
}

/** Check if onboarding has been completed */
export function isOnboarded(parixHome?: string): boolean {
  return loadProfile(parixHome) !== null;
}
