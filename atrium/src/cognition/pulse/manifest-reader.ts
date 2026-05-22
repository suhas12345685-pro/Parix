import { existsSync, readFileSync, statSync } from "fs";
import { dirname, join, parse, resolve } from "path";
import type {
  DependencyManifest,
  DependencyLanguage,
} from "./dependency-types.js";

export function findDependencyManifests(
  startPath: string,
  workspaceRoot: string,
  language: DependencyLanguage,
): DependencyManifest[] {
  const root = resolve(workspaceRoot);
  const start = statSafe(startPath)?.isDirectory()
    ? resolve(startPath)
    : dirname(resolve(startPath));
  const manifests: DependencyManifest[] = [];
  let current = start;

  while (isWithin(current, root)) {
    const found = readManifestAt(current, language);
    if (found) manifests.push(found);
    if (current === root) break;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  const rootManifest = readManifestAt(root, language);
  if (
    rootManifest &&
    !manifests.some((manifest) => manifest.path === rootManifest.path)
  ) {
    manifests.push(rootManifest);
  }

  return manifests;
}

export function hasDeclaredDependency(
  manifests: DependencyManifest[],
  packageName: string,
): boolean {
  return manifests.some((manifest) => manifest.packageNames.has(packageName));
}

function readManifestAt(
  dir: string,
  language: DependencyLanguage,
): DependencyManifest | null {
  if (language === "python") {
    return (
      readRequirements(join(dir, "requirements.txt")) ??
      readPyproject(join(dir, "pyproject.toml"))
    );
  }
  return readPackageJson(join(dir, "package.json"));
}

function readPackageJson(path: string): DependencyManifest | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as Record<
      string,
      unknown
    >;
    const names = new Set<string>();
    for (const section of [
      "dependencies",
      "devDependencies",
      "peerDependencies",
      "optionalDependencies",
    ]) {
      const deps = parsed[section];
      if (!deps || typeof deps !== "object" || Array.isArray(deps)) continue;
      for (const name of Object.keys(deps)) names.add(name);
    }
    return { kind: "package_json", path, packageNames: names };
  } catch {
    return null;
  }
}

function readRequirements(path: string): DependencyManifest | null {
  if (!existsSync(path)) return null;
  const names = new Set<string>();
  for (const line of readFileSync(path, "utf-8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("-"))
      continue;
    const match = /^([A-Za-z0-9_.-]+)/.exec(trimmed);
    if (match?.[1]) names.add(normalizePythonName(match[1]));
  }
  return { kind: "requirements_txt", path, packageNames: names };
}

function readPyproject(path: string): DependencyManifest | null {
  if (!existsSync(path)) return null;
  const names = new Set<string>();
  const content = readFileSync(path, "utf-8");
  for (const match of content.matchAll(/["']([A-Za-z0-9_.-]+)[<>=~!;\s"']/g)) {
    if (match[1]) names.add(normalizePythonName(match[1]));
  }
  return { kind: "pyproject_toml", path, packageNames: names };
}

function normalizePythonName(name: string): string {
  return name.toLowerCase().replace(/_/g, "-");
}

function statSafe(path: string) {
  try {
    return statSync(path);
  } catch {
    return null;
  }
}

function isWithin(path: string, root: string): boolean {
  const resolved = resolve(path);
  const parsed = parse(root);
  return resolved === root || resolved.startsWith(root + parsed.root.slice(-1));
}
