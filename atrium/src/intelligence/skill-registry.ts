import { readdirSync, readFileSync, existsSync, statSync } from "fs";
import { resolve, join } from "path";
import type {
  SkillManifest,
  SkillTrigger,
} from "../../../shared/types/skill.js";

export interface RegisteredSkill {
  manifest: SkillManifest;
  skillDir: string; // absolute path to the skill folder
}

export interface SkillRegistryDelta {
  op: "upsert" | "remove" | "refresh";
  id: string;
  manifest?: SkillManifest;
  skillDir?: string;
  revision?: string;
}

export interface SkillRegistrySubscriptionOptions {
  endpoint: string;
  token?: string;
  intervalMs?: number;
  onError?: (error: Error) => void;
}

export interface SkillRegistrySubscription {
  stop(): void;
  getCursor(): string | null;
}

interface RegistryState {
  bySkillId: Map<string, RegisteredSkill>;
  byEventType: Map<string, RegisteredSkill[]>;
  revision: string | null;
}

let state: RegistryState = {
  bySkillId: new Map(),
  byEventType: new Map(),
  revision: null,
};

const PLATFORM: "windows" | "macos" | "linux" =
  process.platform === "win32"
    ? "windows"
    : process.platform === "darwin"
      ? "macos"
      : "linux";

/**
 * Scan a directory for `task-*` skill folders, load and (lightly) validate
 * each `config.json`, and register them. Returns the registered skills.
 *
 * Idempotent: clears prior state. Safe to call again on hot reload.
 */
export function loadSkills(skillsRoot: string): RegisteredSkill[] {
  state = { bySkillId: new Map(), byEventType: new Map(), revision: null };

  if (!existsSync(skillsRoot)) {
    console.warn(`[ATRIUM:SKILLS] Skills root missing: ${skillsRoot}`);
    return [];
  }

  const entries = readdirSync(skillsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith("task-"))
    .map((d) => join(skillsRoot, d.name));

  // Onboarding writes the user's chosen skills to PARIX_ACTIVE_SKILLS
  // (comma-separated ids). When set, only those skills load; unset = load all.
  const activeRaw = (process.env.PARIX_ACTIVE_SKILLS ?? "").trim();
  const activeSet = activeRaw
    ? new Set(activeRaw.split(",").map((s) => s.trim()).filter(Boolean))
    : null;

  const registered: RegisteredSkill[] = [];
  for (const skillDir of entries) {
    const configPath = join(skillDir, "config.json");
    if (!existsSync(configPath)) continue;

    let manifest: SkillManifest;
    try {
      const raw = readFileSync(configPath, "utf-8");
      manifest = JSON.parse(raw) as SkillManifest;
    } catch (err) {
      console.warn(
        `[ATRIUM:SKILLS] Bad config.json at ${configPath}: ${(err as Error).message}`,
      );
      continue;
    }

    const issues = validateManifest(manifest);
    if (issues.length > 0) {
      console.warn(
        `[ATRIUM:SKILLS] Skipping ${manifest.id ?? skillDir}: ${issues.join("; ")}`,
      );
      continue;
    }

    if (!manifest.enabled) continue;
    if (activeSet && manifest.id && !activeSet.has(manifest.id)) continue;

    const entryPath = resolve(skillDir, manifest.entry);
    if (!existsSync(entryPath) || !statSync(entryPath).isFile()) {
      console.warn(
        `[ATRIUM:SKILLS] ${manifest.id}: entry not found at ${entryPath} — skipping`,
      );
      continue;
    }

    const reg: RegisteredSkill = { manifest, skillDir };
    registerSkill(reg);
    registered.push(reg);
  }

  console.log(
    `[ATRIUM:SKILLS] Loaded ${registered.length} skill manifest(s) from ${skillsRoot}`,
  );
  return registered;
}

export function applySkillDelta(delta: SkillRegistryDelta): RegisteredSkill | null {
  if (delta.op === "refresh") {
    state.revision = delta.revision ?? state.revision;
    return null;
  }

  if (delta.op === "remove") {
    unregisterSkill(delta.id);
    state.revision = delta.revision ?? state.revision;
    return null;
  }

  if (!delta.manifest) {
    throw new Error(`Skill delta ${delta.id} missing manifest`);
  }
  const skillDir =
    delta.skillDir ??
    resolve(process.env.PARIX_SKILLS_DIR ?? resolve(process.cwd(), "..", "skills"), delta.id);

  const issues = validateManifest(delta.manifest);
  if (issues.length > 0) {
    throw new Error(`Skill delta ${delta.id} rejected: ${issues.join("; ")}`);
  }

  const entryPath = resolve(skillDir, delta.manifest.entry);
  if (!existsSync(entryPath) || !statSync(entryPath).isFile()) {
    throw new Error(`Skill delta ${delta.id} entry not found at ${entryPath}`);
  }

  const reg: RegisteredSkill = {
    manifest: delta.manifest,
    skillDir,
  };
  unregisterSkill(delta.manifest.id);
  if (delta.manifest.enabled) registerSkill(reg);
  state.revision = delta.revision ?? state.revision;
  return delta.manifest.enabled ? reg : null;
}

export function createSkillRegistrySubscriptionWorker(
  options: SkillRegistrySubscriptionOptions,
): SkillRegistrySubscription {
  let stopped = false;
  let cursor: string | null = null;
  const intervalMs = options.intervalMs ?? 15_000;

  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      const url = new URL(options.endpoint);
      if (cursor) url.searchParams.set("cursor", cursor);
      const response = await fetch(url, {
        headers: options.token
          ? { authorization: `Bearer ${options.token}` }
          : undefined,
      });
      if (!response.ok) {
        throw new Error(`registry sync failed: ${response.status}`);
      }
      const body = (await response.json()) as {
        cursor?: string;
        deltas?: SkillRegistryDelta[];
      };
      for (const delta of body.deltas ?? []) {
        applySkillDelta(delta);
      }
      cursor = body.cursor ?? cursor;
    } catch (err) {
      options.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    },
    getCursor() {
      return cursor;
    },
  };
}

/**
 * Returns every registered skill whose trigger matches the given event.
 * Match rules — ALL must hold for a single trigger to fire:
 *   - eventType equals event.type
 *   - if `minConfidence` is set: event.confidence >= minConfidence
 *   - if `platforms` is set and doesn't include 'any': PLATFORM must be listed
 *   - if `dataKeys` is set: every key must be present in event.data
 *   - if `keywords` is set: at least one keyword appears (case-insensitive)
 *     anywhere in stringified event.data
 */
export function matchSkills(event: {
  type: string;
  data: Record<string, unknown>;
  confidence: number;
}): RegisteredSkill[] {
  const candidates = state.byEventType.get(event.type) ?? [];
  if (candidates.length === 0) return [];

  const dataStr = JSON.stringify(event.data).toLowerCase();
  const dataKeySet = new Set(Object.keys(event.data));

  const out: RegisteredSkill[] = [];

  for (const reg of candidates) {
    const trig = reg.manifest.triggers.find((t) => triggerMatches(t, event, dataStr, dataKeySet));
    if (trig) out.push(reg);
  }

  return out;
}

function triggerMatches(
  trig: SkillTrigger,
  event: { type: string; confidence: number },
  dataStr: string,
  dataKeySet: Set<string>,
): boolean {
  if (trig.eventType !== event.type) return false;

  if (typeof trig.minConfidence === "number" && event.confidence < trig.minConfidence) {
    return false;
  }

  if (trig.platforms && trig.platforms.length > 0 && !trig.platforms.includes("any")) {
    if (!trig.platforms.includes(PLATFORM)) return false;
  }

  if (trig.dataKeys && trig.dataKeys.length > 0) {
    for (const key of trig.dataKeys) {
      if (!dataKeySet.has(key)) return false;
    }
  }

  if (trig.keywords && trig.keywords.length > 0) {
    const hit = trig.keywords.some((kw) => dataStr.includes(kw.toLowerCase()));
    if (!hit) return false;
  }

  return true;
}

export function getRegisteredSkill(id: string): RegisteredSkill | undefined {
  return state.bySkillId.get(id);
}

export function getAllRegisteredSkills(): RegisteredSkill[] {
  return [...state.bySkillId.values()];
}

export function getRegistryStats(): {
  totalSkills: number;
  totalTriggers: number;
  eventTypes: string[];
  revision: string | null;
} {
  let totalTriggers = 0;
  for (const reg of state.bySkillId.values()) {
    totalTriggers += reg.manifest.triggers.length;
  }
  return {
    totalSkills: state.bySkillId.size,
    totalTriggers,
    eventTypes: [...state.byEventType.keys()].sort(),
    revision: state.revision,
  };
}

// Test-only: reset state between isolated tests.
export function _resetRegistry(): void {
  state = { bySkillId: new Map(), byEventType: new Map(), revision: null };
}

function registerSkill(reg: RegisteredSkill): void {
  state.bySkillId.set(reg.manifest.id, reg);
  for (const trig of reg.manifest.triggers) {
    const bucket = state.byEventType.get(trig.eventType) ?? [];
    bucket.push(reg);
    state.byEventType.set(trig.eventType, bucket);
  }
}

function unregisterSkill(id: string): void {
  const existing = state.bySkillId.get(id);
  if (!existing) return;
  state.bySkillId.delete(id);
  for (const [eventType, regs] of state.byEventType) {
    const filtered = regs.filter((reg) => reg.manifest.id !== id);
    if (filtered.length > 0) {
      state.byEventType.set(eventType, filtered);
    } else {
      state.byEventType.delete(eventType);
    }
  }
}

// Minimal runtime validation — defensive layer beyond the JSON schema validator
// (which runs in `scripts/validate-skill-manifests.ts` at lint time).
function validateManifest(m: unknown): string[] {
  const issues: string[] = [];
  if (!m || typeof m !== "object") return ["not an object"];
  const obj = m as Record<string, unknown>;

  if (typeof obj.id !== "string" || obj.id.length === 0) issues.push("missing id");
  if (typeof obj.version !== "string") issues.push("missing version");
  if (typeof obj.enabled !== "boolean") issues.push("enabled must be boolean");
  if (typeof obj.entry !== "string") issues.push("missing entry");
  if (obj.runtime !== "py" && obj.runtime !== "node" && obj.runtime !== "sh") {
    issues.push("runtime must be one of py|node|sh");
  }
  if (!Array.isArray(obj.triggers) || obj.triggers.length === 0) issues.push("triggers must be non-empty array");
  if (typeof obj.reversibility !== "number") issues.push("reversibility must be number");
  if (!Array.isArray(obj.permissions)) issues.push("permissions must be array");

  return issues;
}
