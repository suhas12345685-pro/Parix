import { registerJob } from "../index.js";
import { persistToFile } from "../../memory/db.js";
import { storageManager } from "../../storage/index.js";

export function registerStorageSyncJob(intervalMs = 30_000): string {
  return registerJob("storage-sync", intervalMs, async () => {
    persistToFile();
    const providerId = process.env.PARIX_STORAGE_PROVIDER ?? "local";
    const result = await storageManager.sync(providerId, ["data/memory.db"]);
    if (result.errors.length > 0) {
      console.warn(
        `[SCHEDULER:storage-sync] ${result.errors.length} error(s): ${result.errors.join("; ")}`,
      );
    }
  });
}
