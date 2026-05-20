import { describe, expect, it } from "vitest";
import type { SkillManifest } from "../../../../shared/types/skill.js";
import {
  isFirstPartySkill,
  permittedPermissionsForSkill,
  resolvePermittedPermissions,
} from "../skill-permissions.js";

function makeManifest(
  id: string,
  permissions: SkillManifest["permissions"],
): SkillManifest {
  return {
    id,
    version: "0.0.1",
    enabled: true,
    triggers: [],
    entry: "main.sh",
    runtime: "sh",
    inputs: [],
    outputs: [],
    reversibility: 0.9,
    permissions,
  };
}

describe("skill permission grants", () => {
  it("grants only the first-party permission set for a known skill", () => {
    const permissions = permittedPermissionsForSkill("task-security-alert");

    expect(permissions.has("clipboard:read")).toBe(true);
    expect(permissions.has("notification:send")).toBe(true);
    expect(permissions.has("filesystem:write")).toBe(false);
  });

  it("does not grant permissions to unknown skills", () => {
    const permissions = permittedPermissionsForSkill("task-third-party");

    expect(isFirstPartySkill("task-third-party")).toBe(false);
    expect(permissions.size).toBe(0);
  });
});

describe("resolvePermittedPermissions (autonomous-mode aware)", () => {
  it("first-party skills always use the hardcoded allowlist, regardless of mode", () => {
    const manifest = makeManifest("task-security-alert", [
      "clipboard:read",
      "notification:send",
      // Manifest requests more than the allowlist grants; resolver must
      // still cap at the allowlist for first-party skills.
      "filesystem:write",
    ]);

    const offMode = resolvePermittedPermissions(manifest, {
      autonomousMode: false,
    });
    const onMode = resolvePermittedPermissions(manifest, {
      autonomousMode: true,
    });

    for (const set of [offMode, onMode]) {
      expect(set.has("clipboard:read")).toBe(true);
      expect(set.has("notification:send")).toBe(true);
      expect(set.has("filesystem:write")).toBe(false);
    }
  });

  it("third-party skills are denied (empty set) when autonomous mode is OFF", () => {
    const manifest = makeManifest("task-third-party", [
      "filesystem:read",
      "network:write",
    ]);

    const set = resolvePermittedPermissions(manifest, {
      autonomousMode: false,
    });
    expect(set.size).toBe(0);
  });

  it("third-party skills get manifest-declared permissions when autonomous mode is ON", () => {
    const manifest = makeManifest("task-third-party", [
      "filesystem:read",
      "network:write",
    ]);

    const set = resolvePermittedPermissions(manifest, {
      autonomousMode: true,
    });
    expect(set.has("filesystem:read")).toBe(true);
    expect(set.has("network:write")).toBe(true);
    expect(set.has("process:execute")).toBe(false);
  });

  it("defaults to OFF when no options object is passed", () => {
    const manifest = makeManifest("task-third-party", ["filesystem:read"]);
    const set = resolvePermittedPermissions(manifest);
    expect(set.size).toBe(0);
  });
});
