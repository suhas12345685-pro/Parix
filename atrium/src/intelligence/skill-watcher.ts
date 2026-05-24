/**
 * skill-watcher — auto-discovery / hot-reload for skills & plugins.
 *
 * Drop, edit, or remove a `task-*` skill under the skills dir and the registry
 * re-scans automatically (debounced) — no restart, no manual "wire it" step.
 * `loadSkills()` resets + rebuilds the whole registry, so add / modify / delete
 * are all handled by a single re-scan.
 */
import { watch, type FSWatcher } from "node:fs";
import { loadSkills, getRegistryStats } from "./skill-registry.js";

const RELEVANT = /(config\.json|\.py|\.js|\.mjs|\.cjs|\.ts)$/i;
const DEBOUNCE_MS = 300;

/**
 * Start watching `skillsRoot` and hot-reload the skill registry on change.
 * Returns a stop() function. Safe to call once at boot.
 */
export function watchSkills(
  skillsRoot: string,
  onReload?: (stats: ReturnType<typeof getRegistryStats>) => void,
): () => void {
  let timer: NodeJS.Timeout | null = null;
  let watcher: FSWatcher | null = null;

  const reload = () => {
    try {
      loadSkills(skillsRoot);
      const stats = getRegistryStats();
      console.log(
        `[ATRIUM:SKILLS] Hot-reload — ${stats.totalSkills} skill(s), ${stats.totalTriggers} trigger(s)`,
      );
      onReload?.(stats);
    } catch (err) {
      console.warn(
        `[ATRIUM:SKILLS] Hot-reload failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  try {
    watcher = watch(skillsRoot, { recursive: true }, (_event, filename) => {
      // Only react to manifest/entry changes, not editor temp files.
      if (filename && !RELEVANT.test(filename.toString())) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(reload, DEBOUNCE_MS);
    });
    console.log(`[ATRIUM:SKILLS] Auto-discovery watching ${skillsRoot}`);
  } catch (err) {
    console.warn(
      `[ATRIUM:SKILLS] Auto-discovery unavailable (${err instanceof Error ? err.message : String(err)}) — skills load at boot only.`,
    );
    return () => {};
  }

  return () => {
    if (timer) clearTimeout(timer);
    watcher?.close();
  };
}
