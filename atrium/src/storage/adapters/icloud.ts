import { homedir } from "os";
import { resolve } from "path";
import { localStorageAdapter } from "./local.js";
import type {
  StorageAdapter,
  StorageCredentials,
  StorageObject,
} from "../types.js";

const ICLOUD_ROOT = resolve(homedir(), "iCloudDrive", "Parix");

export const icloudStorageAdapter: StorageAdapter = {
  id: "icloud",
  name: "iCloud Drive Storage",
  async connect(credentials: StorageCredentials): Promise<void> {
    await localStorageAdapter.connect({
      ...credentials,
      root: credentials.root ?? process.env.PARIX_ICLOUD_ROOT ?? ICLOUD_ROOT,
    });
  },
  upload(localPath: string, remotePath: string): Promise<string> {
    return localStorageAdapter.upload(localPath, remotePath);
  },
  download(remoteId: string, localPath: string): Promise<void> {
    return localStorageAdapter.download(remoteId, localPath);
  },
  list(prefix?: string): Promise<StorageObject[]> {
    return localStorageAdapter.list(prefix);
  },
  delete(remoteId: string): Promise<void> {
    return localStorageAdapter.delete(remoteId);
  },
  disconnect(): Promise<void> {
    return localStorageAdapter.disconnect();
  },
};
