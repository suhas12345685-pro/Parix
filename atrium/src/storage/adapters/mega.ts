import { createRestStorageAdapter } from "../common.js";

export const megaStorageAdapter = createRestStorageAdapter({
  id: "mega",
  name: "MEGA Storage",
  uploadUrl: (_remotePath, credentials) =>
    credentials.upload_url ?? "https://g.api.mega.co.nz/cs",
  downloadUrl: (remoteId, credentials) =>
    `${credentials.download_url ?? "https://g.api.mega.co.nz/cs"}?id=${encodeURIComponent(remoteId)}`,
  listUrl: (_prefix, credentials) =>
    credentials.list_url ?? "https://g.api.mega.co.nz/cs",
  deleteUrl: (remoteId, credentials) =>
    `${credentials.delete_url ?? "https://g.api.mega.co.nz/cs"}?id=${encodeURIComponent(remoteId)}`,
  deleteMethod: "POST",
});
