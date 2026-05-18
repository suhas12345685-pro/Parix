export interface DebouncedEvent<T = unknown> {
  key: string;
  value: T;
  count: number;
  firstSeenAt: number;
  lastSeenAt: number;
}

export interface DebouncerOptions<T = unknown> {
  windowMs: number;
  onFlush: (event: DebouncedEvent<T>) => void | Promise<void>;
  keyFor?: (value: T) => string;
  now?: () => number;
}

interface Pending<T> {
  value: T;
  count: number;
  firstSeenAt: number;
  lastSeenAt: number;
  timer: ReturnType<typeof setTimeout>;
}

export class Debouncer<T = unknown> {
  private pending = new Map<string, Pending<T>>();
  private windowMs: number;
  private onFlush: (event: DebouncedEvent<T>) => void | Promise<void>;
  private keyFor: (value: T) => string;
  private now: () => number;

  constructor(options: DebouncerOptions<T>) {
    this.windowMs = options.windowMs;
    this.onFlush = options.onFlush;
    this.keyFor = options.keyFor ?? ((value) => JSON.stringify(value));
    this.now = options.now ?? Date.now;
  }

  push(value: T): void {
    const key = this.keyFor(value);
    const timestamp = this.now();
    const existing = this.pending.get(key);

    if (existing) {
      existing.value = value;
      existing.count += 1;
      existing.lastSeenAt = timestamp;
      clearTimeout(existing.timer);
      existing.timer = setTimeout(() => void this.flushKey(key), this.windowMs);
      return;
    }

    this.pending.set(key, {
      value,
      count: 1,
      firstSeenAt: timestamp,
      lastSeenAt: timestamp,
      timer: setTimeout(() => void this.flushKey(key), this.windowMs),
    });
  }

  async flush(): Promise<void> {
    const keys = [...this.pending.keys()];
    await Promise.all(keys.map((key) => this.flushKey(key)));
  }

  clear(): void {
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
    }
    this.pending.clear();
  }

  size(): number {
    return this.pending.size;
  }

  private async flushKey(key: string): Promise<void> {
    const item = this.pending.get(key);
    if (!item) return;

    clearTimeout(item.timer);
    this.pending.delete(key);
    await this.onFlush({
      key,
      value: item.value,
      count: item.count,
      firstSeenAt: item.firstSeenAt,
      lastSeenAt: item.lastSeenAt,
    });
  }
}
