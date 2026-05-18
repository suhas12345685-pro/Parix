import { createRestStorageAdapter } from "../common.js";

const api = "https://drive-api.proton.me";

export const protonStorageAdapter = createRestStorageAdapter({
  id: "proton",
  name: "Proton Drive Storage",
  uploadUrl: (remotePath, credentials) =>
    `${credentials.upload_url ?? `${api}/drive/volumes/${credentials.volume_id}/files`}?name=${encodeURIComponent(remotePath)}`,
  downloadUrl: (remoteId, credentials) =>
    credentials.download_url
      ? `${credentials.download_url}/${encodeURIComponent(remoteId)}`
      : `${api}/drive/volumes/${credentials.volume_id}/files/${encodeURIComponent(remoteId)}/download`,
  listUrl: (prefix, credentials) =>
    `${api}/drive/volumes/${credentials.volume_id}/files${prefix ? `?Name=${encodeURIComponent(prefix)}` : ""}`,
  deleteUrl: (remoteId, credentials) =>
    `${api}/drive/volumes/${credentials.volume_id}/files/${encodeURIComponent(remoteId)}`,
});
