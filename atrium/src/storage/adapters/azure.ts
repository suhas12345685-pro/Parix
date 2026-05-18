import { createHmac } from "crypto";
import { createRestStorageAdapter } from "../common.js";

function sas(credentials: Record<string, string | undefined>): string {
  return credentials.sas_token
    ? `?${credentials.sas_token.replace(/^\?/, "")}`
    : "";
}

function blobBase(credentials: Record<string, string | undefined>): string {
  const account = credentials.account ?? process.env.PARIX_AZURE_ACCOUNT;
  const container = credentials.container ?? process.env.PARIX_AZURE_CONTAINER;
  if (!account || !container)
    throw new Error("azure storage requires account and container credentials");
  return `https://${account}.blob.core.windows.net/${container}`;
}

export const azureStorageAdapter = createRestStorageAdapter({
  id: "azure",
  name: "Azure Blob Storage",
  uploadUrl: (remotePath, credentials) =>
    `${blobBase(credentials)}/${encodeURI(remotePath)}${sas(credentials)}`,
  uploadHeaders: () => ({
    "x-ms-blob-type": "BlockBlob",
    "x-ms-version": "2023-11-03",
  }),
  downloadUrl: (remoteId, credentials) =>
    `${blobBase(credentials)}/${encodeURI(remoteId)}${sas(credentials)}`,
  listUrl: (prefix, credentials) =>
    `${blobBase(credentials)}${sas(credentials)}${sas(credentials) ? "&" : "?"}restype=container&comp=list${prefix ? `&prefix=${encodeURIComponent(prefix)}` : ""}`,
  deleteUrl: (remoteId, credentials) =>
    `${blobBase(credentials)}/${encodeURI(remoteId)}${sas(credentials)}`,
  parseList: (json) => {
    void createHmac;
    return Array.isArray(json) ? (json as any) : [];
  },
});
