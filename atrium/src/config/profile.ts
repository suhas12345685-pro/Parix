/**
 * Profile Loader — Loads the Parix profile and applies it to subsystems.
 *
 * This is the bridge between Hatchery's config and Atrium's runtime:
 *   - Loads profile.json at boot
 *   - Wires permissions → sensor enable/disable
 *   - Wires personality → Constitution rules, Governor limits, notification style
 *   - Injects Enterprise forbiddenScope as dynamic Constitution block rules
 *
 * Called from atrium/src/index.ts at startup.
 */

import {
  CHANNEL_IDS,
  createDefaultAegisSettings,
  type ParixProfile,
  type PermissionsConfig,
  type PersonalPersonality,
  type EnterprisePersonality,
  type EnterpriseIdentity,
  loadProfile,
  saveProfile,
  isPersonalProfile,
  isEnterpriseProfile,
} from "parix-shared";
import { constitution } from "../intelligence/constitution.js";
import {
  loadInstallContext,
  getActiveSkills,
  type InstallContext,
} from "./install-context.js";
import { getDb } from "../memory/db.js";
import {
  describeAutonomyLevel,
  evaluateAutonomy,
} from "../intelligence/autonomy-policy.js";

// ─── Exported profile access ─────────────────────────────────────────

let _profile: ParixProfile | null = null;
let _installContext: InstallContext | null = null;

export function getProfile(): ParixProfile | null {
  return _profile;
}

export function getPermissions(): PermissionsConfig | null {
  return _profile?.permissions ?? null;
}

export function getRuntimeInstallContext(): InstallContext | null {
  return _installContext;
}

export function getRuntimeSkills(): string[] {
  return getActiveSkills();
}

export function getMode(): "personal" | "enterprise" | null {
  return _profile?.mode ?? null;
}

export function getAgentName(): string {
  if (!_profile) return "Parix";
  if (isPersonalProfile(_profile)) {
    return _profile.agentProfile.agentName || "Parix";
  }
  if (isEnterpriseProfile(_profile)) {
    return _profile.agentProfile.agentName || "Parix";
  }
  return "Parix";
}

export function getAutonomyLevel(): string {
  if (!_profile) return "safe-auto-fix";
  if (isPersonalProfile(_profile)) {
    return (_profile.personality as PersonalPersonality).autonomyLevel;
  }
  if (isEnterpriseProfile(_profile)) {
    return (_profile.personality as EnterprisePersonality).approvalPolicy;
  }
  return "safe-auto-fix";
}

export function getAegisWakeWord(): string {
  const settings = _profile?.channels.settings.aegis;
  const wakeWord = settings?.wakeWord;
  return typeof wakeWord === "string" && wakeWord.trim() ? wakeWord : "aegis";
}

export function saveRuntimeChannelConfig(
  enabledChannels: string[],
  wakeWord: string,
): void {
  if (!_profile) return;
  const normalizedWakeWord = wakeWord.trim().toLowerCase() || "aegis";
  const enabled = ["aegis", ...enabledChannels.filter((id) => id !== "aegis")];

  _profile.channels = {
    ..._profile.channels,
    primary: "aegis",
    enabled,
    settings: {
      ..._profile.channels.settings,
      aegis: createDefaultAegisSettings(normalizedWakeWord),
    },
  };

  saveProfile(_profile);
  applyChannelConfig(_profile);
}

// ─── Boot-time profile loading ───────────────────────────────────────

export interface ProfileLoadResult {
  loaded: boolean;
  profile: ParixProfile | null;
  reason?: string;
}

/**
 * Load and apply the Parix profile at boot.
 * Returns the loaded profile or null with a reason.
 */
export function loadAndApplyProfile(): ProfileLoadResult {
  _installContext = loadInstallContext();
  if (_installContext) {
    console.log(
      `[ATRIUM:INSTALL] os=${_installContext.os}, arch=${_installContext.arch}, skills=${_installContext.activeSkills.join(", ")}`,
    );
  }

  const profile = loadProfile();

  if (!profile) {
    return {
      loaded: false,
      profile: null,
      reason: "No profile.json found — run `parix onboarding` to set up.",
    };
  }

  _profile = profile;

  // Apply Enterprise-specific Constitution rules
  if (isEnterpriseProfile(profile)) {
    applyEnterpriseSafety(profile);
  }

  // Apply autonomy-level adjustments
  applyProfileApprovalRules(profile);
  applyAutonomyRules(profile);
  applyChannelConfig(profile);

  console.log(
    `[ATRIUM:PROFILE] Loaded: mode=${profile.mode}, agent="${getAgentName()}"`,
  );
  return { loaded: true, profile };
}

function applyChannelConfig(profile: ParixProfile): void {
  const enabled = new Set(["aegis", ...profile.channels.enabled]);
  const knownChannelIds = new Set<string>([...CHANNEL_IDS, "console"]);
  for (const channelId of knownChannelIds) {
    const config = profile.channels.settings[channelId] ?? {};
    getDb().run(
      `INSERT INTO channel_config (channel_id, enabled, config, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(channel_id) DO UPDATE SET
         enabled = excluded.enabled,
         config = excluded.config,
         updated_at = CURRENT_TIMESTAMP`,
      [channelId, enabled.has(channelId) ? 1 : 0, JSON.stringify(config)],
    );
  }

  console.log(
    `[ATRIUM:PROFILE] Channels enabled: ${Array.from(enabled).join(", ")} | Aegis wake word="${getAegisWakeWord()}"`,
  );
}

// ─── Enterprise Safety Rules ─────────────────────────────────────────

function applyEnterpriseSafety(profile: ParixProfile): void {
  const identity = profile.identity as EnterpriseIdentity;
  const personality = profile.personality as EnterprisePersonality;

  // Inject forbiddenScope as dynamic Constitution block rules
  if (identity.forbiddenScope.length > 0) {
    for (const scope of identity.forbiddenScope) {
      const pattern = new RegExp(escapeRegex(scope), "i");
      constitution.addRule((taskType, payload, _ctx) => {
        const text = payloadText(taskType, payload);
        if (pattern.test(text)) {
          return {
            allowed: false,
            reason: `Enterprise policy: "${scope}" is in forbidden scope`,
          };
        }
        return null;
      });
    }
    console.log(
      `[ATRIUM:PROFILE] Enterprise: ${identity.forbiddenScope.length} forbidden scope rules injected`,
    );
  }

  // Strict safety = block all medium-risk actions
  if (personality.safetyBoundary === "strict") {
    constitution.addRule((_taskType, _payload, ctx) => {
      if (ctx.reversibilityScore < 0.5) {
        return {
          allowed: false,
          reason: `Enterprise strict mode: reversibility ${ctx.reversibilityScore.toFixed(2)} < 0.5 threshold`,
        };
      }
      return null;
    });
    console.log("[ATRIUM:PROFILE] Enterprise: strict safety boundary active");
  }
}

function applyProfileApprovalRules(profile: ParixProfile): void {
  const blockedActions = isPersonalProfile(profile)
    ? profile.agentProfile.blockedActions
    : profile.agentProfile.blockedActions;
  const approvalRequiredActions = isPersonalProfile(profile)
    ? profile.agentProfile.approvalRequiredActions
    : profile.agentProfile.approvalRequiredActions;

  for (const action of blockedActions) {
    constitution.addRule((taskType, payload, _ctx) => {
      if (!matchesPolicyTerm(action, taskType, payload)) return null;
      return {
        allowed: false,
        reason: `Profile policy blocks action: ${action}`,
      };
    });
  }

  for (const action of approvalRequiredActions) {
    constitution.addRule((taskType, payload, _ctx) => {
      // NOTE (security-audit-v0.2, finding 1): approval state must not
      // be derived from the payload — payloads are LLM-shaped and a
      // self-approving model would bypass this rule. When real human-
      // approval UX lands (Aegis modal → signed token), thread it
      // through `ctx`, not `payload`.
      if (!matchesPolicyTerm(action, taskType, payload)) return null;
      return {
        allowed: false,
        reason: `Profile policy requires human approval: ${action}`,
      };
    });
  }

  if (isEnterpriseProfile(profile)) {
    constitution.addRule((_taskType, payload, _ctx) => {
      const text = payloadText("enterprise", payload);
      if (!/(unofficial|impersonat|personal session|cookie scraping)/i.test(text)) {
        return null;
      }
      return {
        allowed: false,
        reason:
          "Enterprise policy: use official OAuth, bot apps, APIs, or webhooks and identify as the configured agent",
      };
    });
  }

  console.log(
    `[ATRIUM:PROFILE] Approval rules loaded: blocked=${blockedActions.length}, approval_required=${approvalRequiredActions.length}`,
  );
}

// ─── Autonomy Level Rules ────────────────────────────────────────────

function applyAutonomyRules(_profile: ParixProfile): void {
  const level = getAutonomyLevel();

  if (level === "ask-before-fix" || level === "always-ask") {
    // All actions require confirmation — Constitution blocks anything > trivial
    constitution.addRule((_taskType, _payload, ctx) => {
      if (ctx.reversibilityScore < 0.9) {
        return {
          allowed: false,
          reason: `Autonomy level "${level}": requires user confirmation (reversibility ${ctx.reversibilityScore.toFixed(2)} < 0.9)`,
        };
      }
      return null;
    });
    console.log(
      `[ATRIUM:PROFILE] Autonomy: ${level} — most actions will require confirmation`,
    );
  }
  // Every autonomy mode keeps a hard runtime floor. Higher autonomy changes
  // thresholds; it never disables the Constitution.
  constitution.addRule((_taskType, _payload, ctx) =>
    evaluateAutonomy(level, {
      reversibilityScore: ctx.reversibilityScore,
      confidence: ctx.confidence,
    }),
  );
  console.log(`[ATRIUM:PROFILE] Autonomy: ${describeAutonomyLevel(level)}`);
}

// ─── Utility ─────────────────────────────────────────────────────────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesPolicyTerm(
  term: string,
  taskType: string,
  payload: Record<string, unknown>,
): boolean {
  const normalized = term.trim().toLowerCase();
  if (!normalized) return false;

  const text = payloadText(taskType, payload);
  if (text.includes(normalized)) return true;

  if (normalized.includes("external message")) {
    return /\b(send|email|gmail|slack|teams|telegram|discord|dm|post|reply)\b/i.test(
      text,
    );
  }
  if (normalized.includes("delete") || normalized.includes("destructive")) {
    return /\b(delete|remove|destroy|drop|truncate|rm\s+-rf|del\s+\/s)\b/i.test(
      text,
    );
  }
  if (normalized.includes("spend") || normalized.includes("money")) {
    return /\b(pay|purchase|buy|charge|invoice|billing|stripe|checkout)\b/i.test(
      text,
    );
  }
  if (normalized.includes("production")) {
    return /\b(prod|production|deploy|release|terraform|kubectl|vercel\s+--prod)\b/i.test(
      text,
    );
  }
  if (normalized.includes("credential")) {
    return /\b(credential|secret|token|password|api[_-]?key|\.env)\b/i.test(
      text,
    );
  }
  if (normalized.includes("impersonate")) {
    return /\b(impersonat|as\s+a\s+human|as\s+the\s+user|from\s+the\s+user)\b/i.test(
      text,
    );
  }
  if (normalized.includes("unofficial")) {
    return /\b(unofficial|cookie|screen\s*scrap|personal\s+session)\b/i.test(
      text,
    );
  }

  return false;
}

function payloadText(
  taskType: string,
  payload: Record<string, unknown>,
): string {
  const command = String(payload.command ?? "");
  const argv = Array.isArray(payload.argv)
    ? payload.argv.map((part) => String(part)).join(" ")
    : "";
  return `${taskType} ${command} ${argv} ${JSON.stringify(payload)}`.toLowerCase();
}
