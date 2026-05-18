import { createRestStorageAdapter } from "../common.js";

const api = "https://api.pcloud.com";

export const pcloudStorageAdapter = createRestStorageAdapter({
  id: "pcloud",
  name: "pCloud Storage",
  uploadUrl: (remotePath) =>
    `${api}/uploadfile?path=/${encodeURIComponent(remotePath)}`,
  downloadUrl: (remoteId) =>
    `${api}/getfilelink?fileid=${encodeURIComponent(remoteId)}`,
  listUrl: (prefix) =>
    `${api}/listfolder?path=/${encodeURIComponent(prefix ?? "")}`,
  deleteUrl: (remoteId) =>
    `${api}/deletefile?fileid=${encodeURIComponent(remoteId)}`,
  deleteMethod: "POST",
  parseList: (json) =>
    ((json as any).metadata?.contents ?? []).map((item: any) => ({
      id: String(item.fileid ?? item.path),
      name: String(item.name),
      size: Number(item.size ?? 0),
      modified: Date.parse(String(item.modified ?? "")) || 0,
    })),
});
