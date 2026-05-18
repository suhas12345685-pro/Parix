import { Debouncer, type DebouncedEvent } from "./debouncer.js";
import {
  enqueue as dlqEnqueue,
  getRetryable,
  remove as dlqRemove,
} from "../intelligence/deadletter.js";

export interface QueueItem<T = unknown> {
  id: string;
  payload: T;
  priority: number;
  addedAt: number;
  retries: number;
}

const queue: QueueItem[] = [];
let processing = false;
let processor: ((item: QueueItem) => Promise<boolean>) | null = null;

export function setProcessor(fn: (item: QueueItem) => Promise<boolean>): void {
  processor = fn;
}

export function enqueue<T>(id: string, payload: T, priority = 5): void {
  queue.push({ id, payload, priority, addedAt: Date.now(), retries: 0 });
  queue.sort((a, b) => a.priority - b.priority);
  if (!processing) void processNext();
}

export function depth(): number {
  return queue.length;
}

export function flush(): QueueItem[] {
  const flushed = queue.splice(0, queue.length);
  return flushed;
}

export function peek(): QueueItem | undefined {
  return queue[0];
}

async function processNext(): Promise<void> {
  if (!processor || queue.length === 0) {
    processing = false;
    return;
  }
  processing = true;
  const item = queue.shift()!;
  try {
    const ok = await processor(item);
    if (!ok && item.retries < 3) {
      item.retries++;
      queue.push(item);
    } else if (!ok) {
      dlqEnqueue(
        item.id,
        "queue_exhausted",
        item.payload as Record<string, unknown>,
        "max retries reached",
      );
    }
  } catch (err) {
    dlqEnqueue(
      item.id,
      "queue_error",
      item.payload as Record<string, unknown>,
      err instanceof Error ? err.message : String(err),
    );
  }
  if (queue.length > 0) {
    setTimeout(() => void processNext(), 50);
  } else {
    processing = false;
  }
}

export function retryDeadLetters(): number {
  const retryable = getRetryable();
  let count = 0;
  for (const entry of retryable) {
    try {
      const payload = JSON.parse(entry.payload);
      enqueue(entry.taskId, payload, 10);
      dlqRemove(entry.taskId);
      count++;
    } catch {
      // skip malformed
    }
  }
  return count;
}

export { Debouncer, type DebouncedEvent };
