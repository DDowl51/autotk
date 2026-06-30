// 入库事件的形状 + 校验/归一化（纯函数，便于单测）。

export interface IncomingEvent {
  name: string;
  props?: Record<string, unknown>;
  ts?: number;
}
export interface IncomingPayload {
  system?: string;
  anonId?: string;
  sessionId?: string;
  appVersion?: string;
  events?: IncomingEvent[];
}

export interface StoredEvent {
  system: string;
  anonId: string;
  sessionId: string;
  appVersion: string | null;
  name: string;
  props: Record<string, unknown>;
  ts: number;
  receivedAt: number;
}

const MAX_EVENTS = 1000; // 单次请求最多收这么多，多的截断
const MAX_NAME = 120;
const cut = (v: unknown, n: number) => String(v ?? "").slice(0, n);

/**
 * 把外来载荷归一化成可入库的行：丢掉没名字的事件、字段截断、缺省兜底。
 * 返回 { rows, rejected }（rejected=被丢/被截断的条数）。
 */
export function normalize(payload: IncomingPayload, receivedAt: number): { rows: StoredEvent[]; rejected: number } {
  const system = payload.system ? cut(payload.system, 60) : "unknown";
  const anonId = cut(payload.anonId, 80);
  const sessionId = cut(payload.sessionId, 80);
  const appVersion = payload.appVersion ? cut(payload.appVersion, 60) : null;

  const all = Array.isArray(payload.events) ? payload.events : [];
  const kept = all.slice(0, MAX_EVENTS);
  let rejected = all.length - kept.length; // 超量截断

  const rows: StoredEvent[] = [];
  for (const e of kept) {
    if (!e || typeof e.name !== "string" || !e.name) {
      rejected++;
      continue;
    }
    rows.push({
      system,
      anonId,
      sessionId,
      appVersion,
      name: e.name.slice(0, MAX_NAME),
      props: e.props && typeof e.props === "object" ? e.props : {},
      ts: typeof e.ts === "number" ? e.ts : receivedAt,
      receivedAt,
    });
  }
  return { rows, rejected };
}
