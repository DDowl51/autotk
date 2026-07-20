// 启动探活(D2):按配置表逐台探 WDA 可达性,并发有上限。
// 关键纪律:不静默——每台都给出「可达 + 分辨率」或「不可达 + 原因」,IP 漂了立刻可见,
// 而不是运行时连错手机才发现(D2 拍板理由)。纯编排,探活动作由 probeOne 注入 → 可测。
import type { Size } from "@auto/core";
import type { ResolvedDevice } from "./config";

export interface ProbeOutcome {
  id: string;
  ok: boolean;
  size?: Size; // 可达时探到的逻辑分辨率(供装配定坐标空间)
  detail: string; // 可达:分辨率字串;不可达:错误信息
}

/** 单台探活动作:成功返回 {ok:true,size};抛错/返回 ok:false 均记为不可达。 */
export type ProbeOne = (device: ResolvedDevice) => Promise<{ ok: boolean; size?: Size; detail: string }>;

/** 对全部设备并发探活(并发上限 concurrency,默认 8);结果按设备原序返回。 */
export async function probeAll(
  devices: ResolvedDevice[],
  probeOne: ProbeOne,
  opts: { concurrency?: number; log?: (msg: string) => void } = {},
): Promise<ProbeOutcome[]> {
  const concurrency = Math.max(1, opts.concurrency ?? 8);
  const outcomes = new Array<ProbeOutcome>(devices.length);
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= devices.length) return;
      const d = devices[i];
      try {
        const r = await probeOne(d);
        outcomes[i] = { id: d.id, ok: r.ok, size: r.size, detail: r.detail };
      } catch (e) {
        outcomes[i] = { id: d.id, ok: false, detail: e instanceof Error ? e.message : String(e) };
      }
      const o = outcomes[i];
      opts.log?.(o.ok ? `✅ ${d.id} (${d.wdaUrl}) 可达 ${o.detail}` : `❌ ${d.id} (${d.wdaUrl}) 不可达: ${o.detail}`);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, devices.length) }, worker));
  return outcomes;
}

/** 汇总(日志/退出判定用)。 */
export function summarize(outcomes: ProbeOutcome[]): { reachable: number; unreachable: number } {
  let reachable = 0;
  for (const o of outcomes) if (o.ok) reachable++;
  return { reachable, unreachable: outcomes.length - reachable };
}
