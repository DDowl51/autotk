// 运营(OPERATOR)按「额度池」给下级分销分配发码额度的纯决策规则（不依赖 DB/框架，可单测）。
//
// 语义：运营的 codeQuota 是**总预算**（null = 不限）。
//   已提交 = 运营自己已发的码数(ownIssued) + 名下各分销已分配额度之和(allocated)。
//   硬不变式：任何时刻 已提交 ≤ 运营总预算。
// 这样运营既能自己发码、也能给分销分额度，但两者共用同一预算，分不出超过剩余的额度，
// 防止「建一堆分销、每个都给满额」绕过总量。
//
// 控制器负责从 DB 取 ownerQuota / ownIssued / allocatedToOthers，再调用本函数。

export type QuotaAllocError = "quota_required" | "quota_pool_exceeded";

export interface QuotaAllocDecision {
  ok: boolean;
  error?: QuotaAllocError;
  /** 分配「本次」之前池中剩余可分配额度；运营不限额时为 null。 */
  remaining: number | null;
}

/**
 * 运营给某个分销设置额度 childQuota 是否允许。
 * @param ownerQuota          运营总预算（null=不限）
 * @param ownIssued           运营自己已发的码数
 * @param allocatedToOthers   运营名下【其他】分销已分配额度之和（**不含**本次目标；新建时传 0）
 * @param childQuota          本次要给该分销设置的额度（null=不限）
 */
export function decideQuotaAllocation(
  ownerQuota: number | null,
  ownIssued: number,
  allocatedToOthers: number,
  childQuota: number | null,
): QuotaAllocDecision {
  // 运营不限额：随意分配（含给下级「不限」）。
  if (ownerQuota == null) return { ok: true, remaining: null };

  const remaining = ownerQuota - ownIssued - allocatedToOthers;

  // 运营有限额时，不能给下级「不限」（等于无限透支预算）。
  if (childQuota == null) return { ok: false, error: "quota_required", remaining };

  if (childQuota > remaining) return { ok: false, error: "quota_pool_exceeded", remaining };
  return { ok: true, remaining };
}

/**
 * 运营「自己发码」时可用的有效额度上限（供发码配额校验用）。
 * = 总预算 - 已分配给下级的额度之和；不限额时为 null。
 * 普通分销(USER)没有下级，allocatedToChildren=0，结果即其自身 codeQuota（行为不变）。
 */
export function selfIssuableQuota(
  ownerQuota: number | null,
  allocatedToChildren: number,
): number | null {
  if (ownerQuota == null) return null;
  return ownerQuota - allocatedToChildren;
}
