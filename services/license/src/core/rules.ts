// 激活决策的纯业务规则（不依赖 DB/框架，方便单测）。
// Nest 服务层负责从 DB 取 code+bindings、调用本函数、再落库 + 签 token。

export type ActivateDecision =
  | { ok: true; reused: boolean } // reused=该设备之前已绑过（不占新名额）
  | { ok: false; reason: "disabled" | "expired" | "device_limit" | "revoked" };

export interface CodeState {
  status: "UNUSED" | "ACTIVE" | "DISABLED";
  maxDevices: number;
  expiresAt: number | null; // 毫秒；null=永久
}

export interface DeviceBinding {
  deviceId: string;
  revoked: boolean;
}

/** 给定码状态 + 已绑设备 + 本次设备，判断能否激活。 */
export function decideActivation(
  code: CodeState,
  bindings: DeviceBinding[],
  deviceId: string,
  now: number = Date.now(),
): ActivateDecision {
  if (code.status === "DISABLED") return { ok: false, reason: "disabled" };
  if (code.expiresAt !== null && now > code.expiresAt) return { ok: false, reason: "expired" };

  const existing = bindings.find((b) => b.deviceId === deviceId);
  if (existing) {
    if (existing.revoked) return { ok: false, reason: "revoked" };
    return { ok: true, reused: true }; // 老设备重新激活，不占新名额
  }

  const activeCount = bindings.filter((b) => !b.revoked).length;
  if (activeCount >= code.maxDevices) return { ok: false, reason: "device_limit" };
  return { ok: true, reused: false };
}
