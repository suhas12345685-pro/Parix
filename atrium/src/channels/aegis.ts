import { getDb } from "../memory/db.js";
import { registerChannel } from "../intelligence/notify.js";
import type { NotificationPayload } from "./types.js";

interface AegisConfig {
  kind?: string;
  wakeWord?: string;
  autoStart?: string;
}

registerChannel({
  id: "aegis",
  name: "Aegis Voice",
  tier: "A",
  async send(payload: NotificationPayload): Promise<boolean> {
    const config = getAegisConfig();
    if (config.kind && config.kind !== "voice") return false;

    getDb().run(
      `INSERT INTO events (event_id, event_type, data, confidence)
       VALUES (?, ?, ?, ?)`,
      [
        `aegis_voice_${Date.now()}`,
        "aegis_voice_notification",
        JSON.stringify({
          title: payload.title,
          body: payload.body,
          urgency: payload.urgency,
          taskId: payload.taskId ?? null,
          actions: payload.actions ?? [],
          wakeWord: config.wakeWord ?? "aegis",
        }),
        1,
      ],
    );

    console.log(
      `[AEGIS:VOICE] Queued voice notification (wake="${config.wakeWord ?? "aegis"}"): ${payload.title}`,
    );
    return true;
  },
});

function getAegisConfig(): AegisConfig {
  try {
    const stmt = getDb().prepare(
      "SELECT config FROM channel_config WHERE channel_id = ? LIMIT 1",
    );
    stmt.bind(["aegis"]);
    if (stmt.step()) {
      const raw = String(stmt.get()[0] ?? "{}");
      stmt.free();
      return JSON.parse(raw) as AegisConfig;
    }
    stmt.free();
  } catch {
    // fall through to defaults
  }

  return { kind: "voice", wakeWord: "aegis", autoStart: "true" };
}
