import type {
  SkillManifest,
  SkillPermission,
} from "../../../shared/types/skill.js";
import { matchSkills, type RegisteredSkill } from "./skill-registry.js";

export interface SkillRouteEvent {
  type: string;
  data: Record<string, unknown>;
  confidence: number;
  timestamp?: number;
}

export interface SkillRouteStep {
  skillId: string;
  inputs: Record<string, unknown>;
  permissions: SkillPermission[];
  reversibility: number;
  reason: string;
}

export interface SkillRoute {
  triggerType: string;
  steps: SkillRouteStep[];
  reversibilityScore: number;
  reasoning: string;
}

const DEFAULT_MAX_ROUTE_STEPS = 4;

export function routeSkillsForEvent(
  event: SkillRouteEvent,
  maxSteps = DEFAULT_MAX_ROUTE_STEPS,
): SkillRoute | null {
  const matches = matchSkills(event);
  if (matches.length === 0) return null;

  const steps = matches
    .slice()
    .sort(compareRouteCandidates)
    .slice(0, maxSteps)
    .map((reg) => toRouteStep(reg, event));

  if (steps.length === 0) return null;

  const reversibilityScore = Math.min(
    ...steps.map((step) => step.reversibility),
  );
  const routeIds = steps.map((step) => step.skillId).join(" -> ");

  return {
    triggerType: event.type,
    steps,
    reversibilityScore,
    reasoning: `Skill route: ${routeIds}`,
  };
}

function compareRouteCandidates(
  a: RegisteredSkill,
  b: RegisteredSkill,
): number {
  const reversibilityDelta =
    (b.manifest.reversibility ?? 0) - (a.manifest.reversibility ?? 0);
  if (reversibilityDelta !== 0) return reversibilityDelta;
  return a.manifest.id.localeCompare(b.manifest.id);
}

function toRouteStep(
  reg: RegisteredSkill,
  event: SkillRouteEvent,
): SkillRouteStep {
  return {
    skillId: reg.manifest.id,
    inputs: buildSkillInputs(reg.manifest, event),
    permissions: [...reg.manifest.permissions],
    reversibility: reg.manifest.reversibility,
    reason: `${reg.manifest.id} matched ${event.type}`,
  };
}

function buildSkillInputs(
  manifest: SkillManifest,
  event: SkillRouteEvent,
): Record<string, unknown> {
  const data = event.data ?? {};
  const inputs: Record<string, unknown> = {
    ...data,
    _event: {
      type: event.type,
      confidence: event.confidence,
      timestamp: event.timestamp,
    },
  };

  for (const field of manifest.inputs) {
    if (inputs[field.name] !== undefined) continue;

    const alias = firstPresent(data, aliasesForInput(field.name));
    if (alias !== undefined) {
      inputs[field.name] = alias;
      continue;
    }

    if (field.default !== undefined) {
      inputs[field.name] = field.default;
    }
  }

  return inputs;
}

function aliasesForInput(inputName: string): string[] {
  switch (inputName) {
    case "projectDir":
      return ["projectDir", "project_dir", "cwd", "workspace", "path"];
    case "repoDir":
      return ["repoDir", "repo_dir", "cwd", "workspace", "path"];
    case "logfile":
      return ["logfile", "log_path", "logPath", "path"];
    case "url":
      return ["url", "href", "targetUrl", "target_url"];
    case "screenshot":
      return ["screenshot", "screenshotPath", "screenshot_path"];
    case "tail":
      return ["tail", "lines", "tailLines", "tail_lines"];
    default:
      return [inputName];
  }
}

function firstPresent(data: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (data[key] !== undefined && data[key] !== null && data[key] !== "") {
      return data[key];
    }
  }
  return undefined;
}
