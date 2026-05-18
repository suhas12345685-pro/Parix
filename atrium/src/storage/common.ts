import { readFile, writeFile } from "fs/promises";
import { dirname, basename } from "path";
import { mkdir } from "fs/promises";
import { audit } from "../intelligence/audit.js";
import type {
  StorageAdapter,
  StorageCredentials,
  StorageObject,
} from "./types.js";

export async function withRetry<T>(
  operation: string,
  fn: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === attempts) break;
      await new Promise((resolve) =>
        setTimeout(resolve, 150 * 2 ** (attempt - 1)),
      );
    }
  }
  throw new Error(
    `${operation} failed after ${attempts} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

export function requireCredential(
  credentials: StorageCredentials,
  key: string,
  provider: string,
): string {
  const value =
    credentials[key] ??
    process.env[
      `PARIX_${provider.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_${key.toUpperCase()}`
    ];
  if (!value)
    throw new Error(`${provider} storage requires credential: ${key}`);
  return value;
}

export function auditStorage(
  provider: string,
  action: string,
  payload?: Record<string, unknown>,
): void {
  audit({ actor: `storage:${provider}`, action: `storage.${action}`, payload });
}

function authHeaders(
  credentials: StorageCredentials,
  provider: string,
): Record<string, string> {
  const token =
    credentials.access_token ??
    credentials.token ??
    process.env[
      `PARIX_${provider.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_TOKEN`
    ];
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function ensureOk(
  response: Response,
  provider: string,
  action: string,
): Promise<Response> {
  if (response.ok) return response;
  const text = await response.text().catch(() => "");
  throw new Error(
    `${provider} ${action} returned ${response.status}: ${text.slice(0, 300)}`,
  );
}

export interface RestAdapterConfig {
  id: string;
  name: string;
  uploadUrl: (remotePath: string, credentials: StorageCredentials) => string;
  downloadUrl: (remoteId: string, credentials: StorageCredentials) => string;
  listUrl: (
    prefix: string | undefined,
    credentials: StorageCredentials,
  ) => string;
  deleteUrl: (remoteId: string, credentials: StorageCredentials) => string;
  uploadHeaders?: (
    remotePath: string,
    credentials: StorageCredentials,
  ) => Record<string, string>;
  listBody?: (prefix: string | undefined) => string | undefined;
  deleteBody?: (remoteId: string) => string | undefined;
  listMethod?: string;
  deleteMethod?: string;
  parseList?: (json: unknown) => StorageObject[];
}

export function createRestStorageAdapter(
  config: RestAdapterConfig,
): StorageAdapter {
  let credentials: StorageCredentials = {};

  return {
    id: config.id,
    name: config.name,
    async connect(nextCredentials: StorageCredentials): Promise<void> {
      credentials = nextCredentials;
      if (!credentials.access_token && !credentials.token) {
        requireCredential(credentials, "token", config.id);
      }
      auditStorage(config.id, "connect");
    },
    async upload(localPath: string, remotePath: string): Promise<string> {
      return withRetry(`${config.id}.upload`, async () => {
        const data = await readFile(localPath);
        const response = await fetch(
          config.uploadUrl(remotePath, credentials),
          {
            method: "PUT",
            headers: {
              ...authHeaders(credentials, config.id),
              "Content-Type": "application/octet-stream",
              ...(config.uploadHeaders?.(remotePath, credentials) ?? {}),
            },
            body: data as unknown as BodyInit,
          },
        );
        await ensureOk(response, config.id, "upload");
        const text = await response.text();
        auditStorage(config.id, "upload", { localPath, remotePath });
        try {
          const json = JSON.parse(text) as {
            id?: string;
            path_lower?: string;
            name?: string;
          };
          return json.id ?? json.path_lower ?? json.name ?? remotePath;
        } catch {
          return text || remotePath;
        }
      });
    },
    async download(remoteId: string, localPath: string): Promise<void> {
      await withRetry(`${config.id}.download`, async () => {
        const response = await fetch(
          config.downloadUrl(remoteId, credentials),
          {
            headers: authHeaders(credentials, config.id),
          },
        );
        await ensureOk(response, config.id, "download");
        await mkdir(dirname(localPath), { recursive: true });
        await writeFile(localPath, Buffer.from(await response.arrayBuffer()));
        auditStorage(config.id, "download", { remoteId, localPath });
      });
    },
    async list(prefix?: string): Promise<StorageObject[]> {
      return withRetry(`${config.id}.list`, async () => {
        const method = config.listMethod ?? (config.listBody ? "POST" : "GET");
        const response = await fetch(config.listUrl(prefix, credentials), {
          method,
          headers: {
            ...authHeaders(credentials, config.id),
            ...(config.listBody ? { "Content-Type": "application/json" } : {}),
          },
          body: config.listBody?.(prefix),
        });
        await ensureOk(response, config.id, "list");
        const json = await response.json();
        auditStorage(config.id, "list", { prefix });
        if (config.parseList) return config.parseList(json);
        const raw = Array.isArray(json)
          ? json
          : ((json as any).value ??
            (json as any).entries ??
            (json as any).items ??
            []);
        return raw.map((item: any) => ({
          id: String(item.id ?? item.path_lower ?? item.name),
          name: String(item.name ?? basename(String(item.id ?? "object"))),
          size: Number(item.size ?? 0),
          modified:
            Date.parse(
              String(
                item.modifiedTime ??
                  item.client_modified ??
                  item.updated_at ??
                  item.lastModifiedDateTime ??
                  "",
              ),
            ) || 0,
        }));
      });
    },
    async delete(remoteId: string): Promise<void> {
      await withRetry(`${config.id}.delete`, async () => {
        const response = await fetch(config.deleteUrl(remoteId, credentials), {
          method: config.deleteMethod ?? "DELETE",
          headers: {
            ...authHeaders(credentials, config.id),
            ...(config.deleteBody
              ? { "Content-Type": "application/json" }
              : {}),
          },
          body: config.deleteBody?.(remoteId),
        });
        await ensureOk(response, config.id, "delete");
        auditStorage(config.id, "delete", { remoteId });
      });
    },
    async disconnect(): Promise<void> {
      credentials = {};
      auditStorage(config.id, "disconnect");
    },
  };
}
