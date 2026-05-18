import { createRestStorageAdapter } from "../common.js";

const api = "https://api.box.com/2.0";

export const boxStorageAdapter = createRestStorageAdapter({
  id: "box",
  name: "Box Storage",
  uploadUrl: (remotePath, credentials) =>
    `${credentials.upload_url ?? "https://upload.box.com/api/2.0/files/content"}?name=${encodeURIComponent(remotePath)}`,
  downloadUrl: (remoteId) =>
    `${api}/files/${encodeURIComponent(remoteId)}/content`,
  listUrl: (prefix, credentials) =>
    `${api}/folders/${encodeURIComponent(credentials.folder_id ?? "0")}/items?limit=1000${prefix ? `&fields=id,name,size,modified_at&filter_term=${encodeURIComponent(prefix)}` : "&fields=id,name,size,modified_at"}`,
  deleteUrl: (remoteId) => `${api}/files/${encodeURIComponent(remoteId)}`,
});
