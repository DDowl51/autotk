// 系统弹窗按钮意图表（英文为主，含少量中文兜底）。
// 策略（按用户确认）：除"相册/照片"权限点允许外，其余权限/弹窗一律拒绝/Not Now。

const DENY = [
  "don't allow",
  "dont allow",
  "ask app not to track",
  "not now",
  "no thanks",
  "maybe later",
  "skip",
  "cancel",
  "don't save",
  "keep only while using",
  "不允许",
  "以后再说",
  "暂不",
  "取消",
];

const ALLOW = [
  "allow access to all photos",
  "allow full access",
  "allow",
  "always allow",
  "ok",
  "允许",
];

// 相册/照片权限 → 允许（发视频 #1 需要）。其余 → 拒绝。
const PHOTO_HINT = /photo|photos|library|相册|照片/i;

export type AlertChoice = { label: string } | { dismiss: true };

/**
 * 给定弹窗文字 + 按钮列表，决定点哪个按钮。
 * - 相册/照片弹窗 → 优先点 ALLOW 类按钮。
 * - 其它 → 优先点 DENY 类按钮。
 * - 都没匹配到 → 返回 {dismiss:true}，调用方走 /alert/dismiss（通常= 取消/拒绝）。
 */
export function chooseAlertButton(text: string, buttons: string[]): AlertChoice {
  const norm = buttons.map((b) => ({ raw: b, l: b.toLowerCase().trim() }));
  const want = PHOTO_HINT.test(text) ? ALLOW : DENY;
  for (const w of want) {
    const exact = norm.find((b) => b.l === w);
    if (exact) return { label: exact.raw };
    const partial = norm.find((b) => b.l.includes(w));
    if (partial) return { label: partial.raw };
  }
  return { dismiss: true };
}
