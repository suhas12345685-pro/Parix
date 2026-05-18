import { copyFile, mkdir, readdir, stat, unlink } from "fs/promises";
import { basename, dirname, join, resolve } from "path";
import { auditStorage, withRetry } from "../common.js";
import type {
  StorageAdapter,
  StorageCredentials,
  StorageObject,
} from "../types.js";

const DEFAULT_ROOT = resolve(process.cwd(), "data", "backups");

let root = DEFAULT_ROOT;

async function walk(dir: string, prefix = ""): Promise<StorageObject[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const output: StorageObject[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      output.push(...(await walk(fullPath, relative)));
    } else {
      const info = await stat(fullPath);
      output.push({
        id: relative,
        name: entry.name,
        size: info.size,
        modified: info.mtimeMs,
      });
    }
  }
  return output;
}

export const localStorageAdapter: StorageAdapter = {
  id: "local",
  name: "Local Storage",
  async connect(credentials: StorageCredentials): Promise<void> {
    root = resolve(
      credentials.root ?? process.env.PARIX_LOCAL_STORAGE_ROOT ?? DEFAULT_ROOT,
    );
    await mkdir(root, { recursive: true });
    auditStorage("local", "connect", { root });
  },
  async upload(localPath: string, remotePath: string): Promise<string> {
    return withRetry("local.upload", async () => {
      const target = resolve(root, remotePath);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(localPath, target);
      auditStorage("local", "upload", { localPath, remotePath });
      return remotePath;
    });
  },
  async download(remoteId: string, localPath: string): Promise<void> {
    await withRetry("local.download", async () => {
      await mkdir(dirname(localPath), { recursive: true });
      await copyFile(resolve(root, remoteId), localPath);
      auditStorage("local", "download", { remoteId, localPath });
    });
  },
  async list(prefix?: string): Promise<StorageObject[]> {
    const base = resolve(root, prefix ?? "");
    const objects = await walk(base);
    auditStorage("local", "list", { prefix });
    return objects.map((object) => ({
      ...object,
      id: prefix ? `${prefix}/${object.id}` : object.id,
      name: basename(object.id),
    }));
  },
  async delete(remoteId: string): Promise<void> {
    await withRetry("local.delete", async () => {
      await unlink(resolve(root, remoteId));
      auditStorage("local", "delete", { remoteId });
    });
  },
  async disconnect(): Promise<void> {
    auditStorage("local", "disconnect");
  },
};
