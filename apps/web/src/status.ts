export type CodeStatus = "UNUSED" | "ACTIVE" | "DISABLED";

export interface StatusView {
  color: string;
  label: string;
}

/** 激活码状态 → 展示用颜色/文案（含“已过期”判定，优先于其它状态）。纯函数，可测。 */
export function codeStatusView(
  status: CodeStatus,
  expiresAt?: string | null,
  now: number = Date.now(),
): StatusView {
  if (expiresAt && new Date(expiresAt).getTime() < now) {
    return { color: "default", label: "已过期" };
  }
  switch (status) {
    case "ACTIVE":
      return { color: "green", label: "已激活" };
    case "DISABLED":
      return { color: "red", label: "已停用" };
    default:
      return { color: "blue", label: "未激活" };
  }
}
