/**
 * 埋点：把事件发到现有 telemetry collector（POST /v1/events）。
 * 服务端低频，逐条 fire-and-forget；没配 collectorUrl 时是 no-op。
 * 与 autotk/managecenter 共用同一 collector，system 标 "signing-station"。
 */

export type TrackFn = (name: string, props?: Record<string, unknown>) => void;

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<unknown>;

export interface TrackerOpts {
  collectorUrl?: string;
  /** 服务实例匿名 id（非 PII），用于在看板里区分实例。 */
  anonId: string;
  appVersion?: string;
  fetchImpl?: FetchLike;
  now?: () => number;
}

export function createTracker(opts: TrackerOpts): TrackFn {
  if (!opts.collectorUrl) return () => {};
  const url = opts.collectorUrl.replace(/\/+$/, "") + "/v1/events";
  const fetchImpl: FetchLike =
    opts.fetchImpl ?? ((u, init) => fetch(u, init as RequestInit));
  const now = opts.now ?? Date.now;

  return (name, props) => {
    const body = JSON.stringify({
      system: "signing-station",
      anonId: opts.anonId,
      appVersion: opts.appVersion,
      events: [{ name, props: props ?? {}, ts: now() }],
    });
    // 不阻塞请求；网络/采集端故障不影响装机主流程。
    void Promise.resolve(
      fetchImpl(url, { method: "POST", headers: { "content-type": "application/json" }, body }),
    ).catch(() => {});
  };
}
