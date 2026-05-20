import { afterEach, describe, expect, it } from "vitest";
import {
  registerUserCreatedSkillPermissions,
  clearUserCreatedSkillPermissions,
  permittedPermissionsForSkill,
  isFirstPartySkill,
  isUserCreatedSkill,
} from "../skill-permissions.js";

afterEach(() => {
  clearUserCreatedSkillPermissions();
});

describe("user-created skill permission registry", () => {
  it("returns empty set for an unknown skill", () => {
    expect(permittedPermissionsForSkill("task-never-existed").size).toBe(0);
    expect(isFirstPartySkill("task-never-existed")).toBe(false);
    expect(isUserCreatedSkill("task-never-existed")).toBe(false);
  });

  it("grants registered permissions to a user-created skill", () => {
    registerUserCreatedSkillPermissions("task-my-custom-skill", [
      "filesystem:read",
      "process:execute",
    ]);
    const grants = permittedPermissionsForSkill("task-my-custom-skill");
    expect(grants.size).toBe(2);
    expect(grants.has("filesystem:read")).toBe(true);
    expect(grants.has("process:execute")).toBe(true);
    expect(isFirstPartySkill("task-my-custom-skill")).toBe(false);
    expect(isUserCreatedSkill("task-my-custom-skill")).toBe(true);
  });

  it("first-party allowlist beats user-created on ID collision", () => {
    // task-disk-cleanup is a first-party skill with declared grants.
    // A malicious / accidental user-created skill with the same ID
    // must NOT override the first-party grant set.
    registerUserCreatedSkillPermissions("task-disk-cleanup", [
      "network:write",
      "process:execute",
    ]);
    const grants = permittedPermissionsForSkill("task-disk-cleanup");
    // First-party grants are filesystem:read + filesystem:write — not
    // network:write. The user registration must be ignored.
    expect(grants.has("network:write")).toBe(false);
    expect(grants.has("filesystem:read")).toBe(true);
    expect(grants.has("filesystem:write")).toBe(true);
    expect(isFirstPartySkill("task-disk-cleanup")).toBe(true);
  });

  it("clear wipes all user-created grants but leaves first-party intact", () => {
    registerUserCreatedSkillPermissions("task-temp-1", ["filesystem:read"]);
    registerUserCreatedSkillPermissions("task-temp-2", ["network:read"]);
    expect(isUserCreatedSkill("task-temp-1")).toBe(true);
    clearUserCreatedSkillPermissions();
    expect(isUserCreatedSkill("task-temp-1")).toBe(false);
    expect(permittedPermissionsForSkill("task-temp-1").size).toBe(0);
    // First-party skill is unaffected.
    expect(permittedPermissionsForSkill("task-disk-cleanup").size).toBe(2);
  });

  it("re-registering the same ID overwrites the previous grant set", () => {
    registerUserCreatedSkillPermissions("task-mutable", ["filesystem:read"]);
    expect(permittedPermissionsForSkill("task-mutable").has("filesystem:read")).toBe(
      true,
    );
    registerUserCreatedSkillPermissions("task-mutable", ["network:read"]);
    const grants = permittedPermissionsForSkill("task-mutable");
    expect(grants.has("filesystem:read")).toBe(false);
    expect(grants.has("network:read")).toBe(true);
  });
});
