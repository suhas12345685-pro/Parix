import { mkdirSync } from 'fs';
import { resolve } from 'path';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  type WASocket,
} from 'baileys';

export interface WhatsAppPairingOptions {
  phoneNumber: string;
  defaultJid?: string;
  allowedJids?: string;
  sessionDir?: string;
  timeoutMs?: number;
  sendVerificationDm?: boolean;
  onPairingCode?: (code: string) => void;
  onStatus?: (message: string) => void;
}

export interface WhatsAppPairingResult {
  ok: boolean;
  status: 'verified' | 'pending' | 'failed';
  pairingCode?: string;
  sessionDir: string;
  defaultJid: string;
  allowedJids: string;
  error?: string;
}

export function defaultWhatsAppSessionDir(): string {
  return resolve(getParixHome(), 'whatsapp-session');
}

export function normalizeWhatsAppPhone(value: string): string {
  return value.replace(/[^\d]/g, '');
}

export function normalizeWhatsAppJid(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.includes('@')) return trimmed;
  const digits = normalizeWhatsAppPhone(trimmed);
  return digits ? `${digits}@s.whatsapp.net` : '';
}

export async function verifyWhatsAppPairing(
  options: WhatsAppPairingOptions
): Promise<WhatsAppPairingResult> {
  const phoneNumber = normalizeWhatsAppPhone(options.phoneNumber);
  const sessionDir = options.sessionDir || defaultWhatsAppSessionDir();
  const defaultJid = normalizeWhatsAppJid(options.defaultJid || phoneNumber);
  const allowedJids = options.allowedJids
    ? options.allowedJids
        .split(',')
        .map(normalizeWhatsAppJid)
        .filter(Boolean)
        .join(',')
    : defaultJid;
  const timeoutMs = options.timeoutMs ?? 120_000;

  if (!phoneNumber) {
    return {
      ok: false,
      status: 'failed',
      sessionDir,
      defaultJid,
      allowedJids,
      error: 'WhatsApp phone number is required for pairing',
    };
  }

  mkdirSync(sessionDir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  let sock: WASocket | null = null;
  let settled = false;
  let pairingCode: string | undefined;
  let lastError: string | undefined;
  const deadline = Date.now() + timeoutMs;

  return await new Promise<WhatsAppPairingResult>((resolve) => {
    const finish = async (ok: boolean, error?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);

      if (ok && options.sendVerificationDm !== false && sock) {
        try {
          await sock.sendMessage(defaultJid, {
            text: 'Parix WhatsApp channel verified. This linked-device session is ready for agent DMs.',
          });
        } catch (err) {
          ok = false;
          error =
            err instanceof Error
              ? `Paired, but verification DM failed: ${err.message}`
              : 'Paired, but verification DM failed';
        }
      }

      try {
        await sock?.end(undefined);
      } catch {
        // best effort: Hatchery only needs to verify and persist the session
      }

      resolve({
        ok,
        status: ok ? 'verified' : 'failed',
        pairingCode,
        sessionDir,
        defaultJid,
        allowedJids,
        error,
      });
    };

    const startSocket = async () => {
      if (settled) return;
      try {
        sock = makeWASocket({
          auth: state,
          browser: ['Parix Hatchery', 'Chrome', '1.0.0'],
          markOnlineOnConnect: false,
          printQRInTerminal: false,
          qrTimeout: Math.min(timeoutMs, 60_000),
        });

        sock.ev.on('creds.update', saveCreds);
        sock.ev.on('connection.update', (update) => {
          if (update.connection === 'open') {
            options.onStatus?.('WhatsApp linked-device session opened');
            void finish(true);
            return;
          }

          if (update.connection !== 'close') return;

          const code = disconnectStatusCode(update.lastDisconnect?.error);
          if (code === DisconnectReason.loggedOut) {
            void finish(false, 'WhatsApp logged out during pairing');
            return;
          }

          if (!settled && Date.now() < deadline) {
            options.onStatus?.('WhatsApp pairing socket restarted; waiting for session...');
            setTimeout(() => void startSocket(), 1500);
          }
        });

        if (!state.creds.registered && !pairingCode) {
          pairingCode = await sock.requestPairingCode(phoneNumber);
          options.onPairingCode?.(pairingCode);
          options.onStatus?.('Enter the pairing code in WhatsApp Linked Devices');
        } else if (state.creds.registered) {
          options.onStatus?.('Existing WhatsApp linked-device session found');
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        void finish(false, lastError);
      }
    };

    const timeout = setTimeout(() => {
      void finish(
        false,
        lastError ?? `Timed out waiting for WhatsApp pairing after ${timeoutMs / 1000}s`
      );
    }, timeoutMs);

    void startSocket();
  });
}

function getParixHome(): string {
  return (
    process.env.PARIX_HOME ||
    resolve(process.env.HOME || process.env.USERPROFILE || '', '.parix')
  );
}

function disconnectStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const output = (error as { output?: { statusCode?: number } }).output;
  return output?.statusCode;
}
