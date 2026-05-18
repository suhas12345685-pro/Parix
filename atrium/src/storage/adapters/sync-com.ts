import { createRestStorageAdapter } from "../common.js";

function base(credentials: Record<string, string | undefined>): string {
  return (
    credentials.api_base ??
    process.env.PARIX_SYNC_COM_API_BASE ??
    "https://api.sync.com/v1"
  );
}

export const synccomStorageAdapter = createRestStorageAdapter({
  id: "sync-com",
  name: "Sync.com Storage",
  uploadUrl: (remotePath, credentials) =>
    `${base(credentials)}/files/${encodeURI(remotePath)}`,
  downloadUrl: (remoteId, credentials) =>
    `${base(credentials)}/files/${encodeURIComponent(remoteId)}/content`,
  listUrl: (prefix, credentials) =>
    `${base(credentials)}/files${prefix ? `?prefix=${encodeURIComponent(prefix)}` : ""}`,
  deleteUrl: (remoteId, credentials) =>
    `${base(credentials)}/files/${encodeURIComponent(remoteId)}`,
});
