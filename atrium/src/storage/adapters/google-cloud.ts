import { createRestStorageAdapter } from "../common.js";

function bucket(credentials: Record<string, string | undefined>): string {
  const name = credentials.bucket ?? process.env.PARIX_GOOGLE_CLOUD_BUCKET;
  if (!name) throw new Error("google-cloud storage requires bucket credential");
  return name;
}

export const googlecloudStorageAdapter = createRestStorageAdapter({
  id: "google-cloud",
  name: "Google Cloud Storage",
  uploadUrl: (remotePath, credentials) =>
    `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket(credentials))}/o?uploadType=media&name=${encodeURIComponent(remotePath)}`,
  downloadUrl: (remoteId, credentials) =>
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket(credentials))}/o/${encodeURIComponent(remoteId)}?alt=media`,
  listUrl: (prefix, credentials) =>
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket(credentials))}/o${prefix ? `?prefix=${encodeURIComponent(prefix)}` : ""}`,
  deleteUrl: (remoteId, credentials) =>
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket(credentials))}/o/${encodeURIComponent(remoteId)}`,
  parseList: (json) =>
    ((json as any).items ?? []).map((item: any) => ({
      id: String(item.name),
      name: String(item.name).split("/").pop() ?? String(item.name),
      size: Number(item.size ?? 0),
      modified: Date.parse(String(item.updated ?? "")) || 0,
    })),
});
