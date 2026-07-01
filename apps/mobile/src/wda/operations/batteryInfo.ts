import { request } from "../client";
import { sessionPath } from "../session";

/**
 * WDA 原始电量信息。
 * level：0..1 的比例（-1 = 未知，如模拟器）；
 * state：0 未知 / 1 未充电 / 2 充电中 / 3 已充满。
 */
export interface WdaBattery {
  level: number;
  state: number;
}

/** 查询设备电量（需已建 session；GET /session/:id/wda/batteryInfo）。 */
export default function batteryInfo(): Promise<WdaBattery> {
  return request<WdaBattery>(sessionPath("/wda/batteryInfo"));
}
