import { registerChannel } from "../types.js";
import type { NotificationPayload } from "../types.js";

const ncUrl = process.env.NEXTCLOUD_URL;
const username = process.env.NEXTCLOUD_USERNAME;
const appPassword = process.env.NEXTCLOUD_APP_PASSWORD;
const talkToken = process.env.NEXTCLOUD_TALK_TOKEN;

registerChannel({
  id: "nextcloud-talk",
  name: "Nextcloud Talk",
  tier: "B",
  async send(payload: NotificationPayload): Promise<boolean> {
    if (!ncUrl || !username || !appPassword || !talkToken) return false;
    const auth = Buffer.from(`${username}:${appPassword}`).toString("base64");
    const res = await fetch(
      `${ncUrl}/ocs/v2.php/apps/spreed/api/v1/chat/${talkToken}`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
          "OCS-APIRequest": "true",
        },
        body: JSON.stringify({ message: `${payload.title}\n${payload.body}` }),
      },
    );
    return res.ok;
  },
});
