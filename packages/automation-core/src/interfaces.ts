// 依赖倒置的核心接口:core 定义,平台/插件实现。core 不 import 任何实现。
import type { Box, Point, Size } from "./geometry";

/** 截图字节(PNG)。用 Uint8Array 保持与运行时无关(Node Buffer 是其子类)。 */
export type ImageBytes = Uint8Array;

// ——— L0 设备驱动:iOS-WDA 实现之。会话/自愈/超时封在实现内部 ———
export interface Driver {
  screenshot(): Promise<ImageBytes>;
  tap(p: Point): Promise<void>;
  swipe(from: Point, to: Point, durMs: number): Promise<void>;
  typeText(s: string): Promise<void>;
  /** 动作前置:把目标 app 切前台(WDA 只作用前台)。 */
  activateApp(appId: string): Promise<void>;
  /** 会话失效自愈(如 WDA 404 → 重建 session)。 */
  ensureHealthy(): Promise<void>;
  /** 逻辑分辨率(竖屏锁定,查一次即可)。 */
  windowSize(): Promise<Size>;
}

// ——— 感知:LocateAnything(定位)+ OCR(读文本)实现之 ———
export interface LocateQuery {
  id: string;
  phrase: string;
  region?: Box;
}
export interface Hit {
  id: string;
  box: Box;
  score: number;
}
export interface TextLine {
  text: string;
  box: Box;
}
export interface Perceptor {
  /** grounding 组合查询:一次多目标;缺席/低置信目标不返回。坐标决策的唯一来源。 */
  locate(img: ImageBytes, queries: LocateQuery[]): Promise<Hit[]>;
  /** OCR 读文本(评论/文案),喂业务逻辑;不参与坐标决策。 */
  readText(img: ImageBytes, region?: Box): Promise<TextLine[]>;
}

// ——— 跨进程重启的持久状态:去重/限量(如 DM 名单、每日计数)———
export interface StateStore {
  has(ns: string, key: string): Promise<boolean>;
  add(ns: string, key: string): Promise<void>;
  /** 按「ns + 当天」累加并返回当前值(用于每日配额)。 */
  incrDaily(ns: string, key: string): Promise<number>;
}
