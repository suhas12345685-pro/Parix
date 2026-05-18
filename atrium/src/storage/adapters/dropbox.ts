import { basename } from "path";
import { createRestStorageAdapter } from "../common.js";

export const dropboxStorageAdapter = createRestStorageAdapter({
  id: "dropbox",
  name: "Dropbox Storage",
  uploadUrl: () => "https://content.dropboxapi.com/2/files/upload",
  uploadHeaders: (remotePath) => ({
    "Dropbox-API-Arg": JSON.stringify({
      path: remotePath.startsWith("/") ? remotePath : `/${remotePath}`,
      mode: "overwrite",
      autorename: false,
      mute: true,
    }),
  }),
  downloadUrl: (_remoteId) => "https://content.dropboxapi.com/2/files/download",
  listUrl: () => "https://api.dropboxapi.com/2/files/list_folder",
  listBody: (prefix) =>
    JSON.stringify({ path: prefix ? `/${prefix.replace(/^\/+/, "")}` : "" }),
  deleteUrl: () => "https://api.dropboxapi.com/2/files/delete_v2",
  deleteMethod: "POST",
  deleteBody: (remoteId) =>
    JSON.stringify({
      path: remoteId.startsWith("/") ? remoteId : `/${remoteId}`,
    }),
  parseList: (json) =>
    ((json as any).entries ?? []).map((item: any) => ({
      id: String(item.id ?? item.path_lower),
      name: String(item.name ?? basename(String(item.path_lower))),
      size: Number(item.size ?? 0),
      modified:
        Date.parse(
          String(item.client_modified ?? item.server_modified ?? ""),
        ) || 0,
    })),
});
