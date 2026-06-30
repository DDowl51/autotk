import { randomId } from "./id";
import type { TelemetryEvent, TelemetryStorage, IngestPayload, FetchLike } from "./types";

const ANON_KEY = "telemetry.anonId";

/** 默认内存存储（无持久化场景 / 测试）。 */
class MemoryStorage implements TelemetryStorage {
  private readonly m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
}

export interface TelemetryOptions {
  endpoint: string; // 采集服务 ingest 地址
  system: string; // "autotk" | "management-center" | "license-server"
  appVersion?: string;
  fetch?: FetchLike;
  storage?: TelemetryStorage;
  flushAt?: number; // 攒够多少条立即发，默认 20
  flushIntervalMs?: number; // 定时发间隔，默认 15000
  maxBuffer?: number; // 队列上限（含离线未发），默认 500，超了丢最旧
  now?: () => number;
  genId?: () => string;
  onError?: (e: unknown) => void; // 上报失败回调（绝不抛给业务）
}

/**
 * 第一方埋点客户端：track 入队、批量上报、失败放回队列（离线安全）、匿名 id 持久。
 * 所有外部依赖（fetch/storage/时钟/id）可注入，便于单测与跨端（RN/Node/浏览器）。
 */
export class TelemetryClient {
  private queue: TelemetryEvent[] = [];
  private anonId = "";
  private readonly sessionId: string;
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;

  private readonly fetch: FetchLike;
  private readonly storage: TelemetryStorage;
  private readonly flushAt: number;
  private readonly flushIntervalMs: number;
  private readonly maxBuffer: number;
  private readonly now: () => number;
  private readonly genId: () => string;

  constructor(private readonly opts: TelemetryOptions) {
    this.fetch = opts.fetch ?? ((globalThis as { fetch?: FetchLike }).fetch as FetchLike);
    this.storage = opts.storage ?? new MemoryStorage();
    this.flushAt = opts.flushAt ?? 20;
    this.flushIntervalMs = opts.flushIntervalMs ?? 15000;
    this.maxBuffer = opts.maxBuffer ?? 500;
    this.now = opts.now ?? Date.now;
    this.genId = opts.genId ?? randomId;
    this.sessionId = this.genId();
  }

  /** 载入/生成匿名 id，并启动定时上报。track 前最好先 init（track 也会惰性触发）。 */
  async init(): Promise<void> {
    if (!this.anonId) {
      let id = await this.storage.getItem(ANON_KEY);
      if (!id) {
        id = this.genId();
        await this.storage.setItem(ANON_KEY, id);
      }
      this.anonId = id;
    }
    if (!this.timer && this.flushIntervalMs > 0) {
      this.timer = setInterval(() => void this.flush(), this.flushIntervalMs);
    }
  }

  /** 记一个事件（同步、不阻塞）。攒够 flushAt 条会自动发。 */
  track(name: string, props?: Record<string, unknown>): void {
    this.queue.push({ name, props, ts: this.now() });
    this.cap();
    if (this.queue.length >= this.flushAt) void this.flush();
  }

  /** 立即上报当前队列（一次一批）。失败则放回队列，不丢、不抛。 */
  async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0) return;
    if (!this.anonId) await this.init();
    this.flushing = true;
    const batch = this.queue;
    this.queue = [];
    const payload: IngestPayload = {
      system: this.opts.system,
      anonId: this.anonId,
      sessionId: this.sessionId,
      appVersion: this.opts.appVersion,
      events: batch,
      sentAt: this.now(),
    };
    try {
      const res = await this.fetch(this.opts.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      // 失败：把这批放回队首，下次再发（受 maxBuffer 限制）。
      this.queue = batch.concat(this.queue);
      this.cap();
      this.opts.onError?.(e);
    } finally {
      this.flushing = false;
    }
  }

  /** 超上限丢最旧。 */
  private cap(): void {
    if (this.queue.length > this.maxBuffer) {
      this.queue.splice(0, this.queue.length - this.maxBuffer);
    }
  }

  get pending(): number {
    return this.queue.length;
  }
  get id(): string {
    return this.anonId;
  }

  /** 停止定时器并尽力发完。 */
  async shutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.flush();
  }
}
