import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type {
  SkillManifest,
  SkillRuntime,
  SkillPermission,
} from "../shared/types/skill.js";

const root = resolve(process.cwd());
const skillsDir = join(root, "skills");
const taskSkillDirs = readdirSync(skillsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("task-"))
  .map((entry) => join(skillsDir, entry.name));

const runtimes = new Set<SkillRuntime>(["py", "node", "sh"]);
const permissions = new Set<SkillPermission>([
  "accessibility:read",
  "browser:headless",
  "clipboard:read",
  "docker:write",
  "filesystem:read",
  "filesystem:write",
  "network:read",
  "network:write",
  "notification:send",
  "process:execute",
  "process:read",
  "virtual-desktop:write",
]);

const errors: string[] = [];

for (const dir of taskSkillDirs) {
  const name = dir.split(/[\\/]/).at(-1) ?? dir;
  const configPath = join(dir, "config.json");
  const skillPath = join(dir, "SKILL.md");

  if (!existsSync(skillPath)) {
    errors.push(`${name}: missing SKILL.md`);
  }

  if (!existsSync(configPath)) {
    errors.push(`${name}: missing config.json`);
    continue;
  }

  let manifest: SkillManifest;
  try {
    manifest = JSON.parse(readFileSync(configPath, "utf8")) as SkillManifest;
  } catch (error) {
    errors.push(`${name}: config.json is not valid JSON (${String(error)})`);
    continue;
  }

  validateManifest(name, dir, manifest);
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log(`Validated ${taskSkillDirs.length} task skill manifest(s).`);

function validateManifest(
  name: string,
  dir: string,
  manifest: SkillManifest,
): void {
  if (manifest.id !== name) errors.push(`${name}: id must match folder name`);
  if (typeof manifest.version !== "string" || manifest.version.length === 0) {
    errors.push(`${name}: version is required`);
  }
  if (typeof manifest.enabled !== "boolean")
    errors.push(`${name}: enabled must be boolean`);
  if (!Array.isArray(manifest.triggers) || manifest.triggers.length === 0) {
    errors.push(`${name}: triggers must contain at least one trigger`);
  } else {
    for (const [index, trigger] of manifest.triggers.entries()) {
      if (!trigger.eventType)
        errors.push(`${name}: triggers[${index}].eventType is required`);
      if (
        trigger.minConfidence !== undefined &&
        (trigger.minConfidence < 0 || trigger.minConfidence > 1)
      ) {
        errors.push(
          `${name}: triggers[${index}].minConfidence must be between 0 and 1`,
        );
      }
    }
  }
  if (!runtimes.has(manifest.runtime))
    errors.push(`${name}: runtime must be py, node, or sh`);
  if (!manifest.entry || !existsSync(join(dir, manifest.entry))) {
    errors.push(`${name}: entry does not exist (${manifest.entry})`);
  }
  if (!Array.isArray(manifest.inputs))
    errors.push(`${name}: inputs must be an array`);
  if (!Array.isArray(manifest.outputs))
    errors.push(`${name}: outputs must be an array`);
  if (
    typeof manifest.reversibility !== "number" ||
    manifest.reversibility < 0 ||
    manifest.reversibility > 1
  ) {
    errors.push(`${name}: reversibility must be a number between 0 and 1`);
  }
  if (!Array.isArray(manifest.permissions)) {
    errors.push(`${name}: permissions must be an array`);
  } else {
    for (const permission of manifest.permissions) {
      if (!permissions.has(permission))
        errors.push(`${name}: unknown permission ${permission}`);
    }
  }
  if (manifest.timeoutMs !== undefined && manifest.timeoutMs < 1000) {
    errors.push(`${name}: timeoutMs must be at least 1000`);
  }
}
