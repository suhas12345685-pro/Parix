import { createHash } from "crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "fs";
import { dirname, extname, join, parse, resolve } from "path";
import { fileURLToPath } from "url";
import type { CognitiveEvent } from "../types.js";
import { getDb, persistToFile } from "../../memory/db.js";
import { dispatch } from "../../intelligence/notify.js";
import { shouldActProactively } from "../../intelligence/generosity.js";
import type { MissingDependency } from "./dependency-types.js";
import { scanImports } from "./import-scanner.js";
import {
  findDependencyManifests,
  hasDeclaredDependency,
} from "./manifest-reader.js";
import { getPulseMemory, recordPulseMemory } from "./memory.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../../..");
const DEBOUNCE_MS = 2_000;
const NOTIFICATION_THRESHOLD = 0.88;
const NOTIFICATION_COOLDOWN_MS = 60 * 60 * 1000;

export interface DependencyForesightDraft {
  id: string;
  importHash: string;
  cwd: string;
  filePath: string;
  manifestPath: string | null;
  missingImports: MissingDependency[];
  draftPath: string;
  suggestedCommands: string[];
  confidence: number;
  notificationScore: number;
  notificationChannel: "silent" | "notify";
  createdAt: number;
  lastSeenAt: number;
}

interface SourceCandidate {
  filePath: string;
  content: string;
}

export function maybeCreateDependencyForesight(
  event: CognitiveEvent,
): DependencyForesightDraft | null {
  const cwd = getCwd(event);
  const source = getFirstSourceCandidate(event, cwd);
  if (!source) return null;

  const fileHash = hashContent(source.content);
  if (isDebounced(source.filePath, fileHash)) return null;
  recordFileHash(source.filePath, fileHash);

  const imports = scanImports(source.content, extname(source.filePath));
  if (imports.length === 0) return null;

  const missing: MissingDependency[] = [];
  const manifestPaths = new Set<string>();
  for (const ref of imports) {
    const manifests = findDependencyManifests(
      source.filePath,
      cwd,
      ref.language,
    );
    for (const manifest of manifests) manifestPaths.add(manifest.path);
    if (hasDeclaredDependency(manifests, ref.packageName)) continue;
    missing.push({
      specifier: ref.specifier,
      packageName: ref.packageName,
      language: ref.language,
      sourceFile: source.filePath,
      manifestPath: manifests[0]?.path ?? null,
    });
  }

  if (missing.length === 0) return null;

  const importHash = hashMissing(source.filePath, missing);
  const now = Date.now();
  const existing = getExistingDraft(importHash);
  const suggestedCommands = buildSuggestedCommands(missing);
  const confidence = scoreConfidence(event.confidence, missing);
  const notificationScore = scoreNotification(confidence, event, existing);
  const shouldNotify = shouldNotifyForDependency(importHash, notificationScore);
  const draftPath =
    existing?.draftPath ?? buildDraftPath(importHash, now, missing);
  const manifestPath =
    missing[0]?.manifestPath ?? [...manifestPaths][0] ?? null;

  const draft: DependencyForesightDraft = {
    id: existing?.id ?? `dependency_foresight_${importHash}`,
    importHash,
    cwd,
    filePath: source.filePath,
    manifestPath,
    missingImports: missing,
    draftPath,
    suggestedCommands,
    confidence,
    notificationScore,
    notificationChannel: shouldNotify ? "notify" : "silent",
    createdAt: existing?.createdAt ?? now,
    lastSeenAt: now,
  };

  writeDraftFile(draft);
  persistDraft(draft);
  recordPulseMemory(
    "last_dependency_foresight",
    {
      importHash,
      draftPath,
      filePath: source.filePath,
      missingImports: missing.map((item) => item.packageName),
      suggestedCommands,
      notificationChannel: draft.notificationChannel,
      notificationScore,
      lastSeenAt: now,
    },
    Math.max(confidence, notificationScore),
  );

  if (shouldNotify) notifyDependencyForesight(draft);
  return draft;
}

export function getLastDependencyForesight(): DependencyForesightDraft | null {
  const stmt = getDb().prepare(
    `SELECT id, import_hash, cwd, file_path, manifest_path,
            missing_imports_json, draft_path, suggested_commands_json,
            confidence, notification_score, notification_channel,
            created_at, last_seen_at
     FROM dependency_foresight_drafts
     ORDER BY last_seen_at DESC
     LIMIT 1`,
  );

  try {
    if (!stmt.step()) return null;
    return rowToDraft(stmt.get());
  } finally {
    stmt.free();
  }
}

function getFirstSourceCandidate(
  event: CognitiveEvent,
  cwd: string,
): SourceCandidate | null {
  const filePath = getEventFilePaths(event)[0];
  const content =
    typeof event.data.content === "string" ? event.data.content : null;

  if (filePath) {
    const resolved = resolve(cwd, filePath);
    if (!isWithin(resolved, cwd)) return null;
    if (content !== null) return { filePath: resolved, content };
    if (!existsSync(resolved) || !statSync(resolved).isFile()) return null;
    return { filePath: resolved, content: readFileSync(resolved, "utf-8") };
  }

  if (content !== null) {
    return { filePath: join(cwd, "inline-source.ts"), content };
  }

  return null;
}

function getEventFilePaths(event: CognitiveEvent): string[] {
  const one = event.data.file_path ?? event.data.filePath;
  if (typeof one === "string" && one.trim()) return [one];

  const many = event.data.changed_files ?? event.data.changedFiles;
  if (Array.isArray(many)) {
    return many.filter(
      (item): item is string => typeof item === "string" && item.trim() !== "",
    );
  }

  return [];
}

function getCwd(event: CognitiveEvent): string {
  const cwd = typeof event.data.cwd === "string" ? event.data.cwd : REPO_ROOT;
  return resolve(cwd);
}

function isDebounced(filePath: string, fileHash: string): boolean {
  const key = `dependency_foresight:file_hash:${hashContent(filePath)}`;
  const remembered = getPulseMemory<{ fileHash: string; lastSeenAt: number }>(
    key,
  );
  if (!remembered || remembered.value.fileHash !== fileHash) return false;
  return Date.now() - remembered.value.lastSeenAt < DEBOUNCE_MS;
}

function recordFileHash(filePath: string, fileHash: string): void {
  const key = `dependency_foresight:file_hash:${hashContent(filePath)}`;
  recordPulseMemory(
    key,
    {
      filePath,
      fileHash,
      lastSeenAt: Date.now(),
    },
    0.8,
  );
}

function buildSuggestedCommands(missing: MissingDependency[]): string[] {
  const nodePackages = [
    ...new Set(
      missing
        .filter((item) => item.language === "node")
        .map((item) => item.packageName),
    ),
  ];
  const pythonPackages = [
    ...new Set(
      missing
        .filter((item) => item.language === "python")
        .map((item) => item.packageName),
    ),
  ];

  const commands: string[] = [];
  if (nodePackages.length > 0) {
    commands.push(`npm install ${nodePackages.join(" ")}`);
  }
  for (const pkg of pythonPackages) {
    commands.push(`pip install ${pkg}`);
  }
  return commands;
}

function scoreConfidence(
  eventConfidence: number,
  missing: MissingDependency[],
): number {
  const languageConfidence = missing.every((item) => item.language === "node")
    ? 0.96
    : 0.78;
  const manifestConfidence = missing.every((item) => item.manifestPath)
    ? 0.08
    : 0;
  return clamp(
    eventConfidence * 0.55 + languageConfidence * 0.37 + manifestConfidence,
  );
}

function scoreNotification(
  confidence: number,
  event: CognitiveEvent,
  existing: DependencyForesightDraft | null,
): number {
  const repeatBoost = existing ? 0.08 : 0;
  const activeFileBoost =
    event.type === "file_changed" || event.type === "workspace_changed"
      ? 0.04
      : 0;
  return clamp(confidence + repeatBoost + activeFileBoost - 0.08);
}

function shouldNotifyForDependency(
  importHash: string,
  notificationScore: number,
): boolean {
  if (notificationScore < NOTIFICATION_THRESHOLD) return false;
  if (!shouldActProactively(notificationScore)) return false;
  return !recentlyNotified(importHash);
}

function notifyDependencyForesight(draft: DependencyForesightDraft): void {
  void dispatch({
    title: "Dependency Foresight Draft Ready",
    body: `Suhas, I sensed a dependency gap before it became a terminal error. I've already drafted the fix in ${draft.draftPath}. Suggested next step: ${draft.suggestedCommands[0] ?? "review the draft"}.`,
    urgency: draft.notificationScore >= 0.94 ? "high" : "medium",
    actions: [{ label: "Open draft", value: draft.draftPath }],
  }).catch((err) => {
    console.error(
      "[PULSE:dependency-foresight] Notification failed:",
      err instanceof Error ? err.message : err,
    );
  });
}

function writeDraftFile(draft: DependencyForesightDraft): void {
  mkdirSync(dirname(draft.draftPath), { recursive: true });
  writeFileSync(
    draft.draftPath,
    [
      "# Dependency Foresight Ghost PR",
      "",
      `Created: ${new Date(draft.createdAt).toISOString()}`,
      `Last seen: ${new Date(draft.lastSeenAt).toISOString()}`,
      `Confidence: ${draft.confidence.toFixed(2)}`,
      `Notification score: ${draft.notificationScore.toFixed(2)}`,
      `Notification mode: ${draft.notificationChannel}`,
      `Source file: ${draft.filePath}`,
      `Manifest checked: ${draft.manifestPath ?? "none found"}`,
      "",
      "## Missing Imports",
      "",
      ...draft.missingImports.map(
        (item) => `- \`${item.specifier}\` -> package \`${item.packageName}\``,
      ),
      "",
      "## Suggested Commands",
      "",
      ...draft.suggestedCommands.map((command) => `- \`${command}\``),
      "",
      "## Why Parix Drafted This",
      "",
      "Import-scanning found an external package that is not declared in the nearest dependency manifest. This Ghost PR is a pre-computed fix draft; Parix has not installed or modified anything.",
      "",
      "## Safe Next Steps",
      "",
      "1. Confirm the import is intentional.",
      "2. Run the suggested install command if the package is correct.",
      "3. Re-run the build/test command before promoting this draft.",
    ].join("\n"),
    "utf-8",
  );
}

function persistDraft(draft: DependencyForesightDraft): void {
  getDb().run(
    `INSERT INTO dependency_foresight_drafts (
       id, import_hash, cwd, file_path, manifest_path, missing_imports_json,
       draft_path, suggested_commands_json, confidence, notification_score,
       notification_channel, created_at, last_seen_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       cwd = excluded.cwd,
       file_path = excluded.file_path,
       manifest_path = excluded.manifest_path,
       missing_imports_json = excluded.missing_imports_json,
       draft_path = excluded.draft_path,
       suggested_commands_json = excluded.suggested_commands_json,
       confidence = excluded.confidence,
       notification_score = excluded.notification_score,
       notification_channel = excluded.notification_channel,
       last_seen_at = excluded.last_seen_at`,
    [
      draft.id,
      draft.importHash,
      draft.cwd,
      draft.filePath,
      draft.manifestPath,
      JSON.stringify(draft.missingImports),
      draft.draftPath,
      JSON.stringify(draft.suggestedCommands),
      draft.confidence,
      draft.notificationScore,
      draft.notificationChannel,
      draft.createdAt,
      draft.lastSeenAt,
    ],
  );
  persistToFile();
}

function getExistingDraft(importHash: string): DependencyForesightDraft | null {
  const stmt = getDb().prepare(
    `SELECT id, import_hash, cwd, file_path, manifest_path,
            missing_imports_json, draft_path, suggested_commands_json,
            confidence, notification_score, notification_channel,
            created_at, last_seen_at
     FROM dependency_foresight_drafts
     WHERE import_hash = ?
     ORDER BY last_seen_at DESC
     LIMIT 1`,
  );
  stmt.bind([importHash]);

  try {
    if (!stmt.step()) return null;
    return rowToDraft(stmt.get());
  } finally {
    stmt.free();
  }
}

function rowToDraft(row: unknown[]): DependencyForesightDraft {
  return {
    id: String(row[0]),
    importHash: String(row[1]),
    cwd: String(row[2]),
    filePath: String(row[3]),
    manifestPath:
      row[4] === null || row[4] === undefined ? null : String(row[4]),
    missingImports: safeParse<MissingDependency[]>(String(row[5]), []),
    draftPath: String(row[6]),
    suggestedCommands: safeParse<string[]>(String(row[7]), []),
    confidence: Number(row[8]),
    notificationScore: Number(row[9]),
    notificationChannel: String(row[10]) === "notify" ? "notify" : "silent",
    createdAt: Number(row[11]),
    lastSeenAt: Number(row[12]),
  };
}

function recentlyNotified(importHash: string): boolean {
  const stmt = getDb().prepare(
    `SELECT last_seen_at
     FROM dependency_foresight_drafts
     WHERE import_hash = ? AND notification_channel = 'notify'
     ORDER BY last_seen_at DESC
     LIMIT 1`,
  );
  stmt.bind([importHash]);

  try {
    if (!stmt.step()) return false;
    return Date.now() - Number(stmt.get()[0]) < NOTIFICATION_COOLDOWN_MS;
  } finally {
    stmt.free();
  }
}

function buildDraftPath(
  importHash: string,
  createdAt: number,
  missing: MissingDependency[],
): string {
  const root =
    process.env.PARIX_SHADOW_DRAFTS_DIR ?? join(REPO_ROOT, "shadow_drafts");
  const stamp = new Date(createdAt).toISOString().replace(/[:.]/g, "-");
  const slug =
    slugify(missing.map((item) => item.packageName).join("-")) ||
    "dependency-gap";
  return join(
    root,
    "technical",
    "dependency-foresight",
    `${stamp}-${slug}-${importHash.slice(0, 8)}.md`,
  );
}

function hashMissing(filePath: string, missing: MissingDependency[]): string {
  return hashContent(
    JSON.stringify({
      filePath: resolve(filePath),
      packages: missing.map((item) => item.packageName).sort(),
    }),
  );
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function isWithin(path: string, root: string): boolean {
  const resolved = resolve(path);
  const base = resolve(root);
  const separator = parse(base).root.includes("\\") ? "\\" : "/";
  return resolved === base || resolved.startsWith(base + separator);
}

function safeParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9@.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/[@/]/g, "");
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}
