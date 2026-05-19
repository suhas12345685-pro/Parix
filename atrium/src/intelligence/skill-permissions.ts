import type { SkillPermission } from "../../../shared/types/skill.js";

const FIRST_PARTY_SKILL_PERMISSIONS: Record<string, SkillPermission[]> = {
  "task-computer-use-headless": [
    "browser:headless",
    "filesystem:write",
    "network:read",
    "network:write",
  ],
  "task-dev-env": ["filesystem:read", "process:execute"],
  "task-disk-cleanup": ["filesystem:read", "filesystem:write"],
  "task-docker-mgmt": ["docker:write", "process:execute"],
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
  return new Set(FIRST_PARTY_SKILL_PERMISSIONS[skillId] ?? []);
}

export function isFirstPartySkill(skillId: string): boolean {
  return skillId in FIRST_PARTY_SKILL_PERMISSIONS;
}
