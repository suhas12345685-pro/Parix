import { registerChannel } from "../intelligence/notify.js";
import type { NotificationPayload } from "./types.js";

interface Notifier {
  notify(
    options: { title: string; message: string; wait?: boolean },
    callback?: (err?: Error) => void,
  ): void;
}

let notifier: Notifier | null = null;

registerChannel({
  id: "desktop",
  name: "Desktop",
  tier: "C",
  async send(payload: NotificationPayload): Promise<boolean> {
    const activeNotifier = await getNotifier();
    if (!activeNotifier) return false;

    return await new Promise<boolean>((resolve) => {
      activeNotifier.notify(
        {
          title: payload.title,
          message: payload.body,
          wait: Boolean(payload.actions?.length),
        },
        (err?: Error) => resolve(!err),
      );
    });
  },
});

async function getNotifier(): Promise<Notifier | null> {
  if (notifier) return notifier;
  try {
    const mod = (await import("node-notifier")) as {
      default?: Notifier;
    } & Notifier;
    notifier = mod.default ?? mod;
    return notifier;
  } catch {
    return null;
  }
}
