import { builtinModules } from "module";
import type {
  DependencyLanguage,
  ImportReference,
} from "./dependency-types.js";

const BUILTINS = new Set(
  builtinModules.flatMap((name) => [
    name,
    name.replace(/^node:/, ""),
    `node:${name.replace(/^node:/, "")}`,
  ]),
);

const JS_IMPORT_PATTERNS = [
  /\bimport\s+(?:type\s+)?(?:[^'"]+\s+from\s+)?["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
];

const PY_IMPORT_PATTERNS = [
  /^\s*import\s+([A-Za-z_][\w.]*)/gm,
  /^\s*from\s+([A-Za-z_][\w.]*)\s+import\b/gm,
];

export function scanImports(
  content: string,
  extensionOrLanguage: string,
): ImportReference[] {
  const language = inferLanguage(extensionOrLanguage);
  const refs =
    language === "python" ? scanPython(content) : scanJavaScript(content);

  const unique = new Map<string, ImportReference>();
  for (const ref of refs) {
    unique.set(`${ref.language}:${ref.packageName}:${ref.specifier}`, ref);
  }
  return [...unique.values()];
}

export function toPackageName(specifier: string): string | null {
  const normalized = specifier.trim();
  if (!normalized || isLocalSpecifier(normalized)) return null;

  const withoutNode = normalized.replace(/^node:/, "");
  if (BUILTINS.has(normalized) || BUILTINS.has(withoutNode)) return null;

  if (withoutNode.startsWith("@")) {
    const parts = withoutNode.split("/");
    if (parts.length < 2) return null;
    return `${parts[0]}/${parts[1]}`;
  }

  return withoutNode.split("/")[0] || null;
}

function scanJavaScript(content: string): ImportReference[] {
  const refs: ImportReference[] = [];
  for (const pattern of JS_IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const specifier = match[1];
      pushRef(refs, specifier, match[0], "node");
    }
  }
  return refs;
}

function scanPython(content: string): ImportReference[] {
  const refs: ImportReference[] = [];
  for (const pattern of PY_IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const specifier = match[1].split(".")[0];
      pushRef(refs, specifier, match[0], "python");
    }
  }
  return refs;
}

function pushRef(
  refs: ImportReference[],
  specifier: string,
  raw: string,
  language: DependencyLanguage,
): void {
  const packageName = toPackageName(specifier);
  if (!packageName) return;
  refs.push({ specifier, packageName, raw, language });
}

function inferLanguage(value: string): DependencyLanguage {
  const normalized = value.toLowerCase().replace(/^\./, "");
  if (normalized === "python" || normalized === "py") return "python";
  return "node";
}

function isLocalSpecifier(specifier: string): boolean {
  return (
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(specifier)
  );
}
