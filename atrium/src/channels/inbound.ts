import { EventEmitter } from "events";

export interface InboundChannelMessage {
  channelId: string;
  chatId: string;
  senderId: string;
  text: string;
  timestamp: number;
  raw?: unknown;
}

type InboundListener = (message: InboundChannelMessage) => void;

const inbound = new EventEmitter();

export function emitInboundMessage(message: InboundChannelMessage): void {
  inbound.emit("message", message);
}

export function onInboundMessage(listener: InboundListener): () => void {
  inbound.on("message", listener);
  return () => inbound.off("message", listener);
}
