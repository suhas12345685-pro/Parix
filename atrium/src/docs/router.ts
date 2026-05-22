/**
 * Documentation Router — resolves and loads .md files based on
 * shared/docs-routing.json at runtime. Provides the Atrium brain
 * with structured access to all routed documentation.
 *
 * Excluded from routing (agent/dev-spec files):
 *   plan.md, ROADMAP.md, SHIP-PLAN.md, MASTER_GOALS.md,
 *   claude.md, codex.md, agents.md, PROMPTS.md
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, resolve, basename, relative } from 'path';

// ─── Types ─────────────────────────────────────────────────────

export interface DocRoute {
  path: string;
  purpose: string;
  consumedBy: string[];
  loadAt: 'boot' | 'on-demand' | 'never';
  scope: string;
  mutable?: boolean;
  pattern?: string;
}

export interface DocCategory {
  description: string;
  files: DocRoute[];
}

export interface DocsRoutingManifest {
  version: string;
  excludedFromRouting: {
    reason: string;
    files: string[];
  };
  routes: Record<string, DocCategory | {
    pattern?: string;
    registryPath?: string;
    consumedBy?: string[];
    loadAt?: string;
    scope?: string;
    subdirectories?: Record<string, string>;
  }>;
  bootFiles: string[];
  onDemandFiles: string[];
  loadOrder: string[];
}

export interface ResolvedDoc {
  path: string;
  absolutePath: string;
  purpose: string;
  scope: string;
  content: string;
  sizeBytes: number;
  loadedAt: number;
}

// ─── State ─────────────────────────────────────────────────────

let manifest: DocsRoutingManifest | null = null;
let projectRoot: string = '';
const cache = new Map<string, ResolvedDoc>();

// ─── Core ──────────────────────────────────────────────────────

/**
 * Initialize the documentation router.
 * Call once at boot from atrium/src/index.ts.
 */
export function initDocsRouter(root: string): void {
  projectRoot = resolve(root);
  const manifestPath = join(projectRoot, 'shared', 'docs-routing.json');

  if (!existsSync(manifestPath)) {
    console.warn('[DOCS-ROUTER] docs-routing.json not found, documentation routing disabled');
    return;
  }

  try {
    const raw = readFileSync(manifestPath, 'utf-8');
    manifest = JSON.parse(raw) as DocsRoutingManifest;
    console.log(`[DOCS-ROUTER] Loaded routing manifest v${manifest.version} with ${manifest.loadOrder.length} categories`);
  } catch (err) {
    console.error('[DOCS-ROUTER] Failed to parse docs-routing.json:', err);
  }
}

/**
 * Load a specific documentation file by its relative path.
 * Returns null if the file doesn't exist or isn't routed.
 */
export function loadDoc(relativePath: string): ResolvedDoc | null {
  if (!manifest) return null;

  // Check cache first
  const cached = cache.get(relativePath);
  if (cached) return cached;

  // Verify it's not excluded
  if (isExcluded(relativePath)) {
    console.warn(`[DOCS-ROUTER] ${relativePath} is excluded from routing (agent/dev-spec file)`);
    return null;
  }

  const absPath = join(projectRoot, relativePath);
  if (!existsSync(absPath)) return null;

  const route = findRoute(relativePath);
  const content = readFileSync(absPath, 'utf-8');
  const stat = statSync(absPath);

  const doc: ResolvedDoc = {
    path: relativePath,
    absolutePath: absPath,
    purpose: route?.purpose ?? 'unrouted document',
    scope: route?.scope ?? 'unknown',
    content,
    sizeBytes: stat.size,
    loadedAt: Date.now(),
  };

  cache.set(relativePath, doc);
  return doc;
}

/**
 * Load all boot-time documentation files.
 * Returns only successfully loaded docs.
 */
export function loadBootDocs(): ResolvedDoc[] {
  if (!manifest) return [];

  const docs: ResolvedDoc[] = [];
  for (const relPath of manifest.bootFiles) {
    const doc = loadDoc(relPath);
    if (doc) docs.push(doc);
  }

  console.log(`[DOCS-ROUTER] Loaded ${docs.length}/${manifest.bootFiles.length} boot documents`);
  return docs;
}

/**
 * Find all documents for a given scope.
 * Scans routes to find matching files without loading their content.
 */
export function findByScope(scope: string): DocRoute[] {
  if (!manifest) return [];

  const results: DocRoute[] = [];
  for (const [, category] of Object.entries(manifest.routes)) {
    if ('files' in category && Array.isArray(category.files)) {
      for (const file of category.files) {
        if (file.scope === scope) {
          results.push(file);
        }
      }
    }
  }
  return results;
}

/**
 * Find all documents consumed by a specific module.
 * Example: findByConsumer('atrium.cognition') returns all docs
 * that the cognition module should have access to.
 */
export function findByConsumer(consumer: string): DocRoute[] {
  if (!manifest) return [];

  const results: DocRoute[] = [];
  for (const [, category] of Object.entries(manifest.routes)) {
    if ('files' in category && Array.isArray(category.files)) {
      for (const file of category.files) {
        if (file.consumedBy.some(c => c === consumer || consumer.startsWith(c) || c.startsWith(consumer))) {
          results.push(file);
        }
      }
    }
  }
  return results;
}

/**
 * Check if a file is excluded from routing.
 */
export function isExcluded(relativePath: string): boolean {
  if (!manifest) return false;
  const name = basename(relativePath);
  return manifest.excludedFromRouting.files.includes(name);
}

/**
 * Get the full routing manifest for introspection.
 */
export function getManifest(): DocsRoutingManifest | null {
  return manifest;
}

/**
 * Clear the document cache. Call when docs may have been modified.
 */
export function clearCache(): void {
  cache.clear();
}

/**
 * List all shadow draft files matching the shadow_drafts pattern.
 */
export function listShadowDrafts(): string[] {
  const shadowDir = join(projectRoot, 'shadow_drafts');
  if (!existsSync(shadowDir)) return [];

  const results: string[] = [];
  walkDir(shadowDir, (filePath) => {
    if (filePath.endsWith('.md')) {
      results.push(relative(projectRoot, filePath).replace(/\\/g, '/'));
    }
  });
  return results;
}

/**
 * Get all on-demand loadable docs for a given context.
 * Useful for the cognition pipeline to know what docs are available
 * without loading them all into memory.
 */
export function getAvailableDocs(): Array<{ path: string; scope: string; purpose: string }> {
  if (!manifest) return [];

  const available: Array<{ path: string; scope: string; purpose: string }> = [];

  for (const [, category] of Object.entries(manifest.routes)) {
    if ('files' in category && Array.isArray(category.files)) {
      for (const file of category.files) {
        if (file.loadAt !== 'never') {
          const absPath = join(projectRoot, file.path);
          if (existsSync(absPath)) {
            available.push({
              path: file.path,
              scope: file.scope,
              purpose: file.purpose,
            });
          }
        }
      }
    }
  }

  return available;
}

// ─── Internals ─────────────────────────────────────────────────

function findRoute(relativePath: string): DocRoute | undefined {
  if (!manifest) return undefined;

  for (const [, category] of Object.entries(manifest.routes)) {
    if ('files' in category && Array.isArray(category.files)) {
      const match = category.files.find(
        f => f.path === relativePath || f.path === relativePath.replace(/\\/g, '/')
      );
      if (match) return match;
    }
  }
  return undefined;
}

function walkDir(dir: string, callback: (filePath: string) => void): void {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath, callback);
      } else if (entry.isFile()) {
        callback(fullPath);
      }
    }
  } catch {
    // Directory may not exist or be inaccessible
  }
}
