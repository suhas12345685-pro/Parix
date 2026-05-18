import { stat } from "fs/promises";
import { basename } from "path";
import { getDb, persistToFile } from "../memory/db.js";
import { audit } from "../intelligence/audit.js";
import type {
  StorageAdapter,
  StorageCredentials,
  StorageObject,
  SyncResult,
} from "./types.js";
import { localStorageAdapter } from "./adapters/local.js";
import { onedriveStorageAdapter } from "./adapters/onedrive.js";
import { azureStorageAdapter } from "./adapters/azure.js";
import { googledriveStorageAdapter } from "./adapters/google-drive.js";
import { googlecloudStorageAdapter } from "./adapters/google-cloud.js";
import { icloudStorageAdapter } from "./adapters/icloud.js";
import { dropboxStorageAdapter } from "./adapters/dropbox.js";
import { boxStorageAdapter } from "./adapters/box.js";
import { megaStorageAdapter } from "./adapters/mega.js";
import { protonStorageAdapter } from "./adapters/proton.js";
import { pcloudStorageAdapter } from "./adapters/pcloud.js";
import { synccomStorageAdapter } from "./adapters/sync-com.js";

const adapters = new Map<string, StorageAdapter>(
  [
    localStorageAdapter,
    onedriveStorageAdapter,
    azureStorageAdapter,
    googledriveStorageAdapter,
    googlecloudStorageAdapter,
    icloudStorageAdapter,
    dropboxStorageAdapter,
    boxStorageAdapter,
    megaStorageAdapter,
    protonStorageAdapter,
    pcloudStorageAdapter,
    synccomStorageAdapter,
  ].map((adapter) => [adapter.id, adapter]),
);

class ProviderPool {
  private active = 0;
  private queue: Array<() => void> = [];

  constructor(private readonly maxConcurrent = 3) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.maxConcurrent) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}

export class StorageManager {
  private connected = new Set<string>();
  private pools = new Map<string, ProviderPool>();

  getProviderIds(): string[] {
    return Array.from(adapters.keys());
  }

  getAdapter(providerId: string): StorageAdapter {
    const adapter = adapters.get(providerId);
    if (!adapter) throw new Error(`Unknown storage provider: ${providerId}`);
    return adapter;
  }

  async connect(providerId: string): Promise<StorageAdapter> {
    const adapter = this.getAdapter(providerId);
    if (!this.connected.has(providerId)) {
      await adapter.connect(this.loadCredentials(providerId));
      this.connected.add(providerId);
    }
    return adapter;
  }

  async backup(paths: string[], providerId = "local"): Promise<SyncResult> {
    const adapter = await this.connect(providerId);
    const result = this.emptyResult(providerId);
    for (const path of paths) {
      await this.pool(providerId).run(async () => {
        try {
          await adapter.upload(path, basename(path));
          result.uploaded++;
        } catch (err) {
          result.errors.push(err instanceof Error ? err.message : String(err));
        }
      });
    }
    audit({
      actor: "storage-manager",
      action: "storage.backup",
      payload: result as unknown as Record<string, unknown>,
    });
    return result;
  }

  async restore(
    remoteId: string,
    localPath: string,
    providerId = "local",
  ): Promise<void> {
    const adapter = await this.connect(providerId);
    await this.pool(providerId).run(() =>
      adapter.download(remoteId, localPath),
    );
    audit({
      actor: "storage-manager",
      action: "storage.restore",
      payload: { providerId, remoteId, localPath },
    });
  }

  async sync(
    providerId = "local",
    localPaths: string[] = [],
  ): Promise<SyncResult> {
    const adapter = await this.connect(providerId);
    const result = this.emptyResult(providerId);
    const remote = new Map<string, StorageObject>();
    for (const item of await adapter.list()) {
      remote.set(item.name, item);
      remote.set(item.id, item);
    }

    for (const localPath of localPaths.length
      ? localPaths
      : ["data/memory.db"]) {
      await this.pool(providerId).run(async () => {
        try {
          const info = await stat(localPath);
          const remoteObject = remote.get(basename(localPath));
          if (remoteObject && remoteObject.modified >= info.mtimeMs) {
            result.skipped++;
            return;
          }
          await adapter.upload(localPath, basename(localPath));
          result.uploaded++;
        } catch (err) {
          result.errors.push(err instanceof Error ? err.message : String(err));
        }
      });
    }

    persistToFile();
    audit({
      actor: "storage-manager",
      action: "storage.sync",
      payload: result as unknown as Record<string, unknown>,
    });
    return result;
  }

  async disconnect(providerId: string): Promise<void> {
    if (!this.connected.has(providerId)) return;
    await this.getAdapter(providerId).disconnect();
    this.connected.delete(providerId);
  }

  private pool(providerId: string): ProviderPool {
    let pool = this.pools.get(providerId);
    if (!pool) {
      pool = new ProviderPool(3);
      this.pools.set(providerId, pool);
    }
    return pool;
  }

  private loadCredentials(providerId: string): StorageCredentials {
    const credentials: StorageCredentials = {};
    try {
      const stmt = getDb().prepare(
        "SELECT key, value FROM storage_credentials WHERE provider = ? AND enabled = 1",
      );
      stmt.bind([providerId]);
      while (stmt.step()) {
        const [key, value] = stmt.get();
        credentials[String(key)] = String(value);
      }
      stmt.free();
    } catch {
      // Schema may not have been migrated yet; env-based credentials still work.
    }
    return credentials;
  }

  private emptyResult(providerId: string): SyncResult {
    return { providerId, uploaded: 0, downloaded: 0, skipped: 0, errors: [] };
  }
}

export const storageManager = new StorageManager();
export type { StorageAdapter, StorageCredentials, StorageObject, SyncResult };
