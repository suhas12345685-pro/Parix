import { createRestStorageAdapter } from "../common.js";

const graph = "https://graph.microsoft.com/v1.0";

export const onedriveStorageAdapter = createRestStorageAdapter({
  id: "onedrive",
  name: "OneDrive Storage",
  uploadUrl: (remotePath) =>
    `${graph}/me/drive/root:/${encodeURI(remotePath)}:/content`,
  downloadUrl: (remoteId) =>
    `${graph}/me/drive/items/${encodeURIComponent(remoteId)}/content`,
  listUrl: (prefix) =>
    prefix
      ? `${graph}/me/drive/root:/${encodeURI(prefix)}:/children`
      : `${graph}/me/drive/root/children`,
  deleteUrl: (remoteId) =>
    `${graph}/me/drive/items/${encodeURIComponent(remoteId)}`,
});
