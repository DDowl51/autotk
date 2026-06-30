import * as fs from "fs";
import * as path from "path";
import type { Point } from "../src/wda";

/**
 * 按设备标定的坐标档案，存于 adaptation/devices.json。
 * 以逻辑分辨率（如 "390x844"）为 key——屏幕几何决定 TikTok 布局。
 */
export interface DeviceProfile {
  screen: { w: number; h: number };
  like: Point;
  comment: Point;
  save: Point;
  share: Point;
  /** 关注按钮（红色 +）；检测不到则为 null。 */
  follow?: Point | null;
}

const FILE = path.resolve(__dirname, "..", "..", "..", "adaptation", "devices.json");

export function deviceKey(w: number, h: number): string {
  return `${w}x${h}`;
}

function readAll(): Record<string, DeviceProfile> {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8")) as Record<string, DeviceProfile>;
  } catch {
    return {};
  }
}

export function loadProfile(key: string): DeviceProfile | null {
  return readAll()[key] ?? null;
}

export function saveProfile(key: string, prof: DeviceProfile): void {
  const all = readAll();
  all[key] = prof;
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(all, null, 2));
}

export { FILE as DEVICES_FILE };
