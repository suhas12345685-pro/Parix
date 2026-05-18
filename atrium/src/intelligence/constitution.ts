export interface ConstitutionVerdict {
  allowed: boolean;
  reason: string;
}

interface CheckContext {
  reversibilityScore: number;
  confidence: number;
  handsStatus: string;
}

type Rule = (
  taskType: string,
  payload: Record<string, unknown>,
  ctx: CheckContext,
) => ConstitutionVerdict | null;

const BLOCKED_COMMANDS = [
  /rm\s+-rf\s+\/(?!\w)/, // rm -rf / (root wipe)
  /mkfs/, // format disk
  /dd\s+if=/, // raw disk write
  /:(){ :\|:& };:/, // fork bomb
  /shutdown|reboot|halt|poweroff/, // system power control
  /format\s+[a-zA-Z]:/, // Windows format drive
  /reg\s+delete\s+HKLM/, // Registry delete system keys
  /del\s+\/[sS]\s+\/[qQ]\s+[cC]:\\/, // del /s /q C:\
  /DROP\s+DATABASE/i, // SQL drop
  /DROP\s+TABLE/i, // SQL drop table
];

const SENSITIVE_PATHS = [
  /\/etc\/passwd/,
  /\/etc\/shadow/,
  /\/etc\/sudoers/,
  /\.ssh\/id_/,
  /\.env/,
  /\.aws\/credentials/,
  /\.gnupg/,
  /HKLM:\\\\SOFTWARE/,
  /System32/i,
];

const DOMAIN_BLOCKED_COMMANDS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /\bgit\s+reset\s+--hard\b/,
    reason: "Blocked destructive git history/worktree reset",
  },
  {
    pattern: /\bgit\s+clean\s+-(?:[^\s]*[fd]|[fd][^\s]*)\b/,
    reason: "Blocked destructive git clean",
  },
  {
    pattern: /\bgit\s+push\b[^\n]*(?:--force|-f)\b/,
    reason: "Blocked force push",
  },
  {
    pattern: /\b(?:npm|pnpm|yarn)\s+(?:publish|unpublish)\b/,
    reason: "Blocked package registry publish/unpublish",
  },
  {
    pattern: /\btwine\s+upload\b|\bpython\s+-m\s+twine\s+upload\b/,
    reason: "Blocked Python package publish",
  },
  {
    pattern: /\bterraform\s+(?:apply|destroy)\b/,
    reason: "Blocked infrastructure mutation",
  },
  {
    pattern: /\bkubectl\s+(?:delete|drain|cordon|scale)\b/,
    reason: "Blocked Kubernetes mutation",
  },
  {
    pattern: /\b(?:aws|gcloud|az)\b[^\n]*\b(?:delete|remove|destroy)\b/i,
    reason: "Blocked cloud resource deletion",
  },
  {
    pattern:
      /\b(?:printenv|env|set)\b[^\n]*(?:TOKEN|SECRET|KEY|PASSWORD|PASS|CREDENTIAL)/i,
    reason: "Blocked credential dumping",
  },
  {
    pattern: /\b(?:taskkill|Stop-Process|kill)\b[^\n]*(?:\/f|-9|-Force)\b/i,
    reason: "Blocked forceful process termination",
  },
];

const rules: Rule[] = [
  // Rule 1: Never execute if Hands is disconnected
  (_taskType, _payload, ctx) => {
    if (ctx.handsStatus === "DISCONNECTED") {
      return { allowed: false, reason: "Hands is disconnected" };
    }
    return null;
  },

  // Rule 2: Never execute if Hands is paralyzed
  (_taskType, _payload, ctx) => {
    if (ctx.handsStatus === "PARALYZED") {
      return { allowed: false, reason: "Hands is paralyzed (ACK timeout)" };
    }
    return null;
  },

  // Rule 3: Block destructive shell commands
  (taskType, payload, _ctx) => {
    if (taskType !== "cli") return null;
    const cmd = String(payload.command ?? "");
    for (const pattern of BLOCKED_COMMANDS) {
      if (pattern.test(cmd)) {
        return {
          allowed: false,
          reason: `Blocked destructive command: ${cmd.slice(0, 80)}`,
        };
      }
    }
    return null;
  },

  // Rule 4: Block access to sensitive paths
  (taskType, payload, _ctx) => {
    if (taskType !== "cli") return null;
    const cmd = String(payload.command ?? "");
    for (const pattern of SENSITIVE_PATHS) {
      if (pattern.test(cmd)) {
        return {
          allowed: false,
          reason: `Blocked access to sensitive path in: ${cmd.slice(0, 80)}`,
        };
      }
    }
    return null;
  },

  // Rule 5: Low-reversibility actions need high confidence
  (_taskType, _payload, ctx) => {
    if (ctx.reversibilityScore < 0.3 && ctx.confidence < 0.9) {
      return {
        allowed: false,
        reason: `Low reversibility (${ctx.reversibilityScore.toFixed(2)}) requires confidence >= 0.9 (got ${ctx.confidence.toFixed(2)})`,
      };
    }
    return null;
  },

  // Rule 6: Block pipe to curl/wget (data exfiltration)
  (taskType, payload, _ctx) => {
    if (taskType !== "cli") return null;
    const cmd = String(payload.command ?? "");
    if (/\|\s*(curl|wget|nc|ncat)\s/.test(cmd)) {
      return {
        allowed: false,
        reason: "Blocked pipe to network tool (potential exfiltration)",
      };
    }
    return null;
  },

  // Rule 7: Block sudo/admin escalation
  (taskType, payload, _ctx) => {
    if (taskType !== "cli") return null;
    const cmd = String(payload.command ?? "");
    if (/^sudo\s/.test(cmd) || /runas\s+\/user:/i.test(cmd)) {
      return {
        allowed: false,
        reason: "Blocked privilege escalation — Parix runs unprivileged",
      };
    }
    return null;
  },

  // Rule 8: Rate limit — no more than 5 CLI tasks per minute
  // (Actual rate tracking is in Governor — this is the hard stop)
  (_taskType, _payload, _ctx) => {
    return null; // Governor handles this
  },

  // Rule 9: Parix-specific guardrails for repo, package, cloud, and OS automation
  (taskType, payload, _ctx) => {
    if (taskType !== "cli") return null;
    const cmd = String(payload.command ?? "");
    for (const { pattern, reason } of DOMAIN_BLOCKED_COMMANDS) {
      if (pattern.test(cmd)) {
        return { allowed: false, reason: `${reason}: ${cmd.slice(0, 80)}` };
      }
    }
    return null;
  },
];

export const constitution = {
  check(
    taskType: string,
    payload: Record<string, unknown>,
    ctx: CheckContext,
  ): ConstitutionVerdict {
    for (const rule of rules) {
      const verdict = rule(taskType, payload, ctx);
      if (verdict !== null && !verdict.allowed) {
        console.log(`[ATRIUM:CONSTITUTION] BLOCKED: ${verdict.reason}`);
        return verdict;
      }
    }
    return { allowed: true, reason: "" };
  },

  addRule(rule: Rule): void {
    rules.push(rule);
  },
};
