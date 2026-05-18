import type {
  SkillManifest,
  SkillPermission,
} from "../../../shared/types/skill.js";

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

export interface ResolveOptions {
  autonomousMode?: boolean;
}

// Resolves the permission clearance set for a skill. First-party skills
// always use their hardcoded allowlist (autonomous mode has no effect on
// them — they're already trusted). Third-party skills get an empty set
// by default, which causes the runner gate to block them; when the user
// has opted into autonomous mode, third-party skills get clearance for
// whatever their manifest declares. The Constitution still applies on
// top of this.
export function resolvePermittedPermissions(
  manifest: SkillManifest,
  opts: ResolveOptions = {},
): Set<SkillPermission> {
  if (isFirstPartySkill(manifest.id)) {
    return permittedPermissionsForSkill(manifest.id);
  }
  if (opts.autonomousMode) {
    return new Set(manifest.permissions);
  }
  return new Set();
}
