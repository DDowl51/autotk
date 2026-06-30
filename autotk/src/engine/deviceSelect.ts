import type { DeviceProfile } from "./onDeviceUI";

/**
 * 按真机分辨率从标定档案里选对应 profile（多机型支持）。
 * 优先精确匹配 `WxH`；没有则返回 undefined（由上层兜底/提示重新标定）。
 * 不做「最接近」匹配——不同分辨率坐标不通用，宁可提示也不要点错。
 */
export function pickProfile(
  profiles: Record<string, DeviceProfile>,
  width: number,
  height: number,
): DeviceProfile | undefined {
  const exact = profiles[`${width}x${height}`];
  if (exact) return exact;
  // 容错：有的设备宽高上报反了，试一下交换
  return profiles[`${height}x${width}`];
}
