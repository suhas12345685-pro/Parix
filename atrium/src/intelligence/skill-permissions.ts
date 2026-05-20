import type { SkillPermission } from "../../../shared/types/skill.js";

// Runtime-registered grants for skills created via Aegis. These are
// kept in-memory; the source of truth for *which* permissions a
// user-created skill declared is its config.json, mirrored here at
// create-time so the runner's permission gate can clear it without a
// full atrium restart. Reset on process restart — relay.ts re-registers
// them when reloading user-created skills.
const USER_CREATED_SKILL_PERMISSIONS = new Map<string, SkillPermission[]>();

export function registerUserCreatedSkillPermissions(
  skillId: string,
  permissions: string[] | readonly string[],
): void {
  USER_CREATED_SKILL_PERMISSIONS.set(
    skillId,
    permissions.slice() as SkillPermission[],
  );
}

export function clearUserCreatedSkillPermissions(): void {
  USER_CREATED_SKILL_PERMISSIONS.clear();
}

const FIRST_PARTY_SKILL_PERMISSIONS: Record<string, SkillPermission[]> = {
  "task-azure-cli": ["process:read", "process:execute"],
  "task-build-watch": ["process:execute", "filesystem:read"],
  "task-clipboard-secret-redactor": [],
  "task-computer-use-headless": [
    "browser:headless",
    "filesystem:write",
    "network:read",
    "network:write",
  ],
  "task-create-mcp": ["filesystem:read", "filesystem:write"],
  "task-dev-env": ["filesystem:read", "process:execute"],
  "task-disk-cleanup": ["filesystem:read", "filesystem:write"],
  "task-docker-mgmt": ["docker:write", "process:execute"],
  "task-focus-context": ["accessibility:read"],
  "task-gcloud": ["process:read", "process:execute"],
  "task-git-recovery": ["filesystem:read", "process:execute"],
  "task-log-analysis": ["filesystem:read"],
  "task-network-fix": ["network:read", "process:execute"],
  "task-power-mgmt": ["process:execute"],
  "task-process-mgmt": ["process:read", "process:execute"],
  "task-security-alert": ["clipboard:read", "notification:send"],
  "task-terminal-error-resolver": [],
  "task-virtual-desktop": ["process:execute", "virtual-desktop:write"],
};

export function permittedPermissionsForSkill(
  skillId: string,
): Set<SkillPermission> {
  if (FIRST_PARTY_SKILL_PERMISSIONS[skillId]) {
    return new Set(FIRST_PARTY_SKILL_PERMISSIONS[skillId]);
  }
  const userGrants = USER_CREATED_SKILL_PERMISSIONS.get(skillId);
  if (userGrants) {
    return new Set(userGrants);
  }
  return new Set();
}

export function isFirstPartySkill(skillId: string): boolean {
  return skillId in FIRST_PARTY_SKILL_PERMISSIONS;
}

export function isUserCreatedSkill(skillId: string): boolean {
  return USER_CREATED_SKILL_PERMISSIONS.has(skillId);
}
