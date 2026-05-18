import { registerChannel } from "../types.js";
import type { NotificationPayload } from "../types.js";

const homeserver = process.env.MATRIX_HOMESERVER_URL;
const accessToken = process.env.MATRIX_ACCESS_TOKEN;
const roomId = process.env.MATRIX_DEFAULT_ROOM_ID;

registerChannel({
  id: "matrix",
  name: "Matrix",
  tier: "A",
  async send(payload: NotificationPayload): Promise<boolean> {
    if (!homeserver || !accessToken || !roomId) return false;
    const txnId = `parix_${Date.now()}`;
    const url = `${homeserver}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`;
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        msgtype: "m.text",
        body: `${payload.title}\n${payload.body}`,
      }),
    });
    return res.ok;
  },
});
