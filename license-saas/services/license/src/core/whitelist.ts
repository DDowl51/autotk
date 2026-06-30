// 分销-产品白名单的纯决策规则（不依赖 DB/框架，方便单测）。
// 控制器负责从 DB 取账号角色 + 白名单产品集合，再调用本函数。

export type Role = "ADMIN" | "USER";

/**
 * 产品是否对账号可见/可发码。
 * ADMIN 恒 true（不受白名单约束）；USER 仅当 productId 在其白名单集合内。
 * 空白名单 => USER 一律 false（显式授权）。
 */
export function isProductAllowed(
  role: Role,
  allowedProductIds: Iterable<string>,
  productId: string,
): boolean {
  if (role === "ADMIN") return true;
  for (const id of allowedProductIds) {
    if (id === productId) return true;
  }
  return false;
}

/**
 * 把码列表收窄到账号可见范围（连带隐藏）。
 * ADMIN 全见；USER 仅保留白名单内产品的码——与 isProductAllowed 同一规则，按列表应用。
 */
export function visibleCodes<T extends { productId: string }>(
  role: Role,
  allowedProductIds: Iterable<string>,
  codes: readonly T[],
): T[] {
  if (role === "ADMIN") return [...codes];
  const set = new Set(allowedProductIds);
  return codes.filter((c) => set.has(c.productId));
}
