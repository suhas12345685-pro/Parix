import { createRestStorageAdapter } from "../common.js";

const drive = "https://www.googleapis.com/drive/v3";

export const googledriveStorageAdapter = createRestStorageAdapter({
  id: "google-drive",
  name: "Google Drive Storage",
  uploadUrl: (remotePath) =>
    `https://www.googleapis.com/upload/drive/v3/files?uploadType=media&name=${encodeURIComponent(remotePath)}`,
  downloadUrl: (remoteId) =>
    `${drive}/files/${encodeURIComponent(remoteId)}?alt=media`,
  listUrl: (prefix) =>
    `${drive}/files?pageSize=1000&fields=files(id,name,size,modifiedTime)&q=${encodeURIComponent(prefix ? `name contains '${prefix.replace(/'/g, "\\'")}'` : "trashed=false")}`,
  deleteUrl: (remoteId) => `${drive}/files/${encodeURIComponent(remoteId)}`,
});
