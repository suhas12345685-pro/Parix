/**
 * Documentation subsystem — barrel export.
 *
 * Provides structured access to all routed .md files in the Parix workspace.
 * Excludes agent/dev-spec files (plan.md, ROADMAP.md, etc.) from routing.
 */

export {
  initDocsRouter,
  loadDoc,
  loadBootDocs,
  findByScope,
  findByConsumer,
  isExcluded,
  getManifest,
  clearCache,
  listShadowDrafts,
  getAvailableDocs,
} from './router.js';

export type {
  DocRoute,
  DocCategory,
  DocsRoutingManifest,
  ResolvedDoc,
} from './router.js';
