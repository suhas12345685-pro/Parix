export interface StorageObject {
  id: string;
  name: string;
  size: number;
  modified: number;
}

export type StorageCredentials = Record<string, string | undefined>;

export interface StorageAdapter {
  id: string;
  name: string;
  connect(credentials: StorageCredentials): Promise<void>;
  upload(localPath: string, remotePath: string): Promise<string>;
  download(remoteId: string, localPath: string): Promise<void>;
  list(prefix?: string): Promise<StorageObject[]>;
  delete(remoteId: string): Promise<void>;
  disconnect(): Promise<void>;
}

export interface SyncResult {
  providerId: string;
  uploaded: number;
  downloaded: number;
  skipped: number;
  errors: string[];
}
