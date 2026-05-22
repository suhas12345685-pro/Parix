import { Socket } from "net";
import { v4 as uuid } from "uuid";
import type { SidecarRequest, SidecarResponse } from "./types.js";

export interface IpcClientOptions {
  host?: string;
  port?: number;
  timeoutMs?: number;
  cooldownMs?: number;
}

export class NeuroSymbolicIpcClient {
  private host: string;
  private port: number;
  private timeoutMs: number;
  private cooldownMs: number;
  private disabledUntil = 0;

  constructor(options: IpcClientOptions = {}) {
    this.host = options.host ?? process.env.PARIX_NEUROSYMBOLIC_HOST ?? "127.0.0.1";
    this.port = Number(options.port ?? process.env.PARIX_NEUROSYMBOLIC_PORT ?? 8771);
    this.timeoutMs = Number(options.timeoutMs ?? process.env.PARIX_NEUROSYMBOLIC_TIMEOUT_MS ?? 35);
    this.cooldownMs = Number(options.cooldownMs ?? 2_000);
  }

  async request<TPayload, TResult>(
    method: SidecarRequest<TPayload>["method"],
    payload: TPayload,
  ): Promise<TResult | null> {
    if (Date.now() < this.disabledUntil) return null;

    const request: SidecarRequest<TPayload> = {
      id: uuid(),
      method,
      payload,
    };

    return new Promise<TResult | null>((resolve) => {
      const socket = new Socket();
      let settled = false;
      let buffer = "";

      const finish = (value: TResult | null, disable = false) => {
        if (settled) return;
        settled = true;
        if (disable) this.disabledUntil = Date.now() + this.cooldownMs;
        socket.destroy();
        resolve(value);
      };

      const timer = setTimeout(() => finish(null, true), this.timeoutMs);

      socket.setNoDelay(true);
      socket.once("error", () => {
        clearTimeout(timer);
        finish(null, true);
      });
      socket.once("timeout", () => {
        clearTimeout(timer);
        finish(null, true);
      });
      socket.on("data", (chunk) => {
        buffer += chunk.toString("utf-8");
        const newline = buffer.indexOf("\n");
        if (newline === -1) return;
        clearTimeout(timer);
        const line = buffer.slice(0, newline);
        try {
          const response = JSON.parse(line) as SidecarResponse<TResult>;
          finish(response.ok ? (response.result ?? null) : null, !response.ok);
        } catch {
          finish(null, true);
        }
      });
      socket.connect(this.port, this.host, () => {
        socket.write(`${JSON.stringify(request)}\n`);
      });
    });
  }
}

