import type { Point } from "../wda";

// 各页面「可点锚点」的单一真源（纯逻辑，src 的 onDeviceUI 与 tools 的 calibratedUI 共用，无副本）。
// 右栏 like/comment/save/share/follow 由标定检测（见 DeviceProfile 主字段）；这里管其余导航/输入/
// 发布点：默认用比例系数（占位，复现现有 390x844 行为），标定档 devices.json 的 anchors 字段可逐点覆盖。

export type AnchorName =
  | "followTab" // 顶部「关注」Tab
  | "popupClose" // 登录/passkey 弹窗右上 ✕
  | "searchIcon" // 顶栏放大镜
  | "searchSubmit" // 搜索提交（红色 Search）
  | "searchFirstResult" // 结果页第一个视频（第一个大概率是广告位，实际改点第二个）
  | "searchSecondResult" // 结果页第二个视频（跳过第一个广告位）
  | "replyEntry" // 某条评论的「Reply」入口（仅用 x，y 随评论行）
  | "commentInput" // 底部评论输入框
  | "profileTab" // 底部「我」Tab
  | "gridFirstCell" // 主页作品网格左上第一格
  | "backArrow" // 左上返回箭头
  | "homeTab" // 底部 Home Tab
  // —— 发布（阶段3 上传流程；均为占位，必须真机标定后才可用）——
  | "publishCreate" // 底部「+」创建
  | "publishUpload" // 相机页「上传/相册」入口
  | "publishAlbumFirst" // 相册第一个视频（最新）
  | "publishNext" // 「下一步」
  | "publishCaption" // 文案输入区
  | "publishPost"; // 「发布」

/** 比例系数：x/y 为屏宽/屏高的比例。当前值复现 390x844 上的既有坐标。 */
const RATIOS: Record<AnchorName, { rx: number; ry: number }> = {
  followTab: { rx: 0.38, ry: 0.065 },
  popupClose: { rx: 0.92, ry: 0.6 },
  searchIcon: { rx: (390 - 28) / 390, ry: 69 / 844 },
  searchSubmit: { rx: (390 - 43) / 390, ry: 69 / 844 },
  searchFirstResult: { rx: 0.25, ry: 0.255 },
  searchSecondResult: { rx: 0.72, ry: 0.255 }, // 右上（双列结果第二个）；第一个常是广告，跳过。异形屏真机可在 devices.json 覆盖

  replyEntry: { rx: 0.25, ry: 0 }, // 仅用 x；y 由具体评论行给
  commentInput: { rx: 0.28, ry: 0.944 },
  profileTab: { rx: 0.9, ry: 0.96 },
  gridFirstCell: { rx: 0.17, ry: 0.55 },
  backArrow: { rx: 0.06, ry: 0.08 },
  homeTab: { rx: 0.1, ry: 0.96 },
  publishCreate: { rx: 0.5, ry: 0.96 },
  publishUpload: { rx: 0.9, ry: 0.92 },
  publishAlbumFirst: { rx: 0.17, ry: 0.3 },
  publishNext: { rx: 0.9, ry: 0.95 },
  publishCaption: { rx: 0.5, ry: 0.2 },
  publishPost: { rx: 0.9, ry: 0.95 },
};

/** 提供 anchors 覆盖的最小结构（DeviceProfile 结构上满足它）。 */
export interface AnchorOverrides {
  anchors?: Partial<Record<AnchorName, Point>>;
}

/** 由屏幕尺寸算出全部锚点的默认坐标（占位比例；异形屏/换比例家族需真机核实）。 */
export function computeAnchors(w: number, h: number): Record<AnchorName, Point> {
  const out = {} as Record<AnchorName, Point>;
  (Object.keys(RATIOS) as AnchorName[]).forEach((k) => {
    out[k] = { x: w * RATIOS[k].rx, y: h * RATIOS[k].ry };
  });
  return out;
}

/** 解析某锚点：优先用标定档里的覆盖值，否则用比例默认。 */
export function resolveAnchor(prof: AnchorOverrides, w: number, h: number, name: AnchorName): Point {
  const o = prof.anchors?.[name];
  if (o) return o;
  return { x: w * RATIOS[name].rx, y: h * RATIOS[name].ry };
}
