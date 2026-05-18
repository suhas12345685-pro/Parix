interface ReversibilityRule {
  pattern: RegExp;
  score: number;
}

const CLI_RULES: ReversibilityRule[] = [
  // Fully reversible (score = 1.0)
  { pattern: /^echo\s/, score: 1.0 },
  { pattern: /^cat\s/, score: 1.0 },
  { pattern: /^ls\s/, score: 1.0 },
  { pattern: /^dir\s/i, score: 1.0 },
  { pattern: /^Get-/, score: 1.0 },
  { pattern: /^head\s/, score: 1.0 },
  { pattern: /^tail\s/, score: 1.0 },
  { pattern: /^wc\s/, score: 1.0 },
  { pattern: /^df\s/, score: 1.0 },
  { pattern: /^free\s/, score: 1.0 },
  { pattern: /^uptime/, score: 1.0 },
  { pattern: /^uname/, score: 1.0 },
  { pattern: /^hostname/, score: 1.0 },
  { pattern: /^whoami/, score: 1.0 },
  { pattern: /^date/, score: 1.0 },
  { pattern: /^notify-send/, score: 1.0 },
  { pattern: /^osascript.*display notification/, score: 1.0 },
  { pattern: /^systemctl\s+(--user\s+)?status/, score: 1.0 },

  // Mostly reversible (score = 0.7 - 0.9)
  { pattern: /^npm\s+install/, score: 0.8 },
  { pattern: /^pip\s+install/, score: 0.8 },
  { pattern: /^brew\s+install/, score: 0.8 },
  { pattern: /^apt\s+install/, score: 0.7 },
  { pattern: /^systemctl\s+(--user\s+)?restart/, score: 0.7 },
  { pattern: /^systemctl\s+(--user\s+)?start/, score: 0.7 },
  { pattern: /^cp\s/, score: 0.8 },
  { pattern: /^Copy-Item/, score: 0.8 },
  { pattern: /^mkdir/, score: 0.9 },
  { pattern: /^git\s+stash/, score: 0.8 },
  { pattern: /^git\s+checkout/, score: 0.7 },

  // Low reversibility (score = 0.1 - 0.5)
  { pattern: /^rm\s/, score: 0.2 },
  { pattern: /^Remove-Item/, score: 0.2 },
  { pattern: /^del\s/i, score: 0.2 },
  { pattern: /^mv\s/, score: 0.4 },
  { pattern: /^Move-Item/, score: 0.4 },
  { pattern: /^chmod\s/, score: 0.5 },
  { pattern: /^chown\s/, score: 0.5 },
  { pattern: /^npm\s+uninstall/, score: 0.5 },
  { pattern: /^pip\s+uninstall/, score: 0.5 },
  { pattern: /^kill\s/, score: 0.3 },
  { pattern: /^taskkill/, score: 0.3 },
  { pattern: /^Stop-Process/, score: 0.3 },
  { pattern: /^git\s+reset/, score: 0.2 },
  { pattern: /^git\s+push\s+--force/, score: 0.1 },

  // Irreversible (score = 0.0)
  { pattern: /^rm\s+-rf/, score: 0.0 },
  { pattern: /^dd\s+if=/, score: 0.0 },
  { pattern: /^mkfs/, score: 0.0 },
  { pattern: /^shred/, score: 0.0 },
];

const TASK_TYPE_DEFAULTS: Record<string, number> = {
  notification: 1.0,
  screenshot: 1.0,
  cli: 0.5,
  file_write: 0.3,
  file_delete: 0.1,
  process_kill: 0.2,
  service_restart: 0.6,
};

export function scoreReversibility(
  taskType: string,
  payload: Record<string, unknown>,
): number {
  if (taskType === "cli") {
    const command = String(payload.command ?? "").trim();
    for (const rule of CLI_RULES) {
      if (rule.pattern.test(command)) {
        return rule.score;
      }
    }
    return 0.5; // unknown commands default to medium risk
  }

  return TASK_TYPE_DEFAULTS[taskType] ?? 0.5;
}
