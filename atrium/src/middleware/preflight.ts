import { getDb } from "../memory/db.js";
import { audit } from "../intelligence/audit.js";
import { isWithinBudget } from "../intelligence/token-governor.js";

export type PreflightFailureCode =
  | "SKILL_MISSING"
  | "CREDENTIAL_MISSING"
  | "GOVERNOR_EXHAUSTED"
  | "HANDS_DISCONNECTED";

export type PreflightResult =
  | { pass: true }
  | { pass: false; reason: string; code: PreflightFailureCode };

export interface PreflightTask {
  taskId?: string;
  type?: string;
  payload?: Record<string, unknown>;
  requiredSkills?: string[];
  requiredCredentials?: Array<{ provider: string; key?: string }>;
  requiresHands?: boolean;
}

export interface PreflightContext {
  handsStatus?: "CONNECTED" | "DISCONNECTED" | "PARALYZED" | string;
}

export function runPreflight(
  task: PreflightTask,
  context: PreflightContext = {},
): PreflightResult {
  const credentialRequirements = [
    ...inferCredentialRequirements(task),
    ...(task.requiredCredentials ?? []),
  ];
  const skillRequirements = [
    ...inferSkillRequirements(task),
    ...(task.requiredSkills ?? []),
  ];

  for (const skillId of new Set(skillRequirements)) {
    if (!hasConfiguredSkill(skillId)) {
      return fail(
        task,
        "SKILL_MISSING",
        `Required skill is not installed or configured: ${skillId}`,
      );
    }
  }

  for (const requirement of credentialRequirements) {
    if (!hasCredential(requirement.provider, requirement.key)) {
      const suffix = requirement.key ? `:${requirement.key}` : "";
      return fail(
        task,
        "CREDENTIAL_MISSING",
        `Missing credential for ${requirement.provider}${suffix}`,
      );
    }
  }

  if (!isWithinBudget()) {
    return fail(
      task,
      "GOVERNOR_EXHAUSTED",
      "Token governor budget is exhausted for the current window",
    );
  }

  if (
    (task.requiresHands ?? requiresHands(task)) &&
    context.handsStatus !== "CONNECTED"
  ) {
    return fail(
      task,
      "HANDS_DISCONNECTED",
      `Hands is ${context.handsStatus ?? "DISCONNECTED"}`,
    );
  }

  return { pass: true };
}

export function assertPreflight(
  task: PreflightTask,
  context: PreflightContext = {},
): void {
  const result = runPreflight(task, context);
  if (!result.pass) throw new Error(`[${result.code}] ${result.reason}`);
}

function fail(
  task: PreflightTask,
  code: PreflightFailureCode,
  reason: string,
): PreflightResult {
  audit({
    actor: "preflight",
    action: "preflight.blocked",
    taskId: task.taskId,
    payload: { code, reason, type: task.type },
  });
  return { pass: false, code, reason };
}

function hasConfiguredSkill(skillId: string): boolean {
  try {
    const stmt = getDb().prepare(
      "SELECT configured FROM skill_setup WHERE skill_id = ? LIMIT 1",
    );
    stmt.bind([skillId]);
    const ok = stmt.step() && Number(stmt.get()[0]) === 1;
    stmt.free();
    return ok;
  } catch {
    return false;
  }
}

function hasCredential(provider: string, key?: string): boolean {
  try {
    const stmt = key
      ? getDb().prepare(
          "SELECT 1 FROM storage_credentials WHERE provider = ? AND key = ? AND enabled = 1 LIMIT 1",
        )
      : getDb().prepare(
          "SELECT 1 FROM storage_credentials WHERE provider = ? AND enabled = 1 LIMIT 1",
        );
    stmt.bind(key ? [provider, key] : [provider]);
    const ok = stmt.step();
    stmt.free();
    if (ok) return true;
  } catch {
    // Env fallback below.
  }

  const envPrefix = `PARIX_${provider.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
  if (key) return Boolean(process.env[`${envPrefix}_${key.toUpperCase()}`]);
  return Object.keys(process.env).some((name) =>
    name.startsWith(`${envPrefix}_`),
  );
}

function inferSkillRequirements(task: PreflightTask): string[] {
  const skills = new Set<string>();
  const payload = task.payload ?? {};
  const explicit = payload.skill_id ?? payload.skillId;
  if (typeof explicit === "string") skills.add(explicit);
  return Array.from(skills);
}

function inferCredentialRequirements(
  task: PreflightTask,
): Array<{ provider: string; key?: string }> {
  const requirements: Array<{ provider: string; key?: string }> = [];
  const payload = task.payload ?? {};
  const provider =
    payload.provider ?? payload.providerId ?? payload.storageProvider;
  if (typeof provider === "string") requirements.push({ provider });
  return requirements;
}

function requiresHands(task: PreflightTask): boolean {
  return ["cli", "screenshot", "voice", "TASK_REQUEST"].includes(
    task.type ?? "",
  );
}
