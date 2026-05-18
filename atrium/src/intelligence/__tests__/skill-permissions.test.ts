import { describe, expect, it } from "vitest";
import {
  isFirstPartySkill,
  permittedPermissionsForSkill,
} from "../skill-permissions.js";

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
