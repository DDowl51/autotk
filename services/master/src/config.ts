// master 配置表解析(纯逻辑,注入插件默认值/校验器 → 与具体插件解耦)。
// D2(决策记录 2026-07-20):手机 IP = DHCP 静态租约 + 本表(UDID↔IP↔编号)为单一真源;
// master 启动按本表拼 WDA 地址、探活、装配 N 台。参数/时段支持「全局默认 + 每台深合并覆盖」。
import { DEFAULT_WINDOWS, validateWindows, type Schedule, type Size } from "@auto/core";

export const DEFAULT_WDA_PORT = 8100;
export const DEFAULT_STAGGER_MS = 3000;
export const DEFAULT_VLM_MODEL = "locateanything-3b";

/** 配置表里的一行(卖家维护)。id=编号(唯一),host=DHCP 静态租约 IP,udid 供库存/日志。 */
export interface DeviceEntry {
  id: string;
  udid: string;
  host: string;
  port?: number; // WDA 端口,默认 8100
  name?: string;
  size?: Size; // 逻辑分辨率;缺省由启动探活查 windowSize 填
  params?: unknown; // 本机参数覆盖(深合并到全局→插件默认)
  schedule?: Schedule; // 本机时段覆盖(缺省用全局)
}

export interface MasterConfigFile {
  vlm: { url: string; model?: string; timeoutMs?: number };
  wdaTimeoutMs?: number; // WDA 请求超时(探活/运行共用);缺省走 driver 默认
  staggerMs?: number; // 错峰:相邻两台启动偏移(平滑 GPU/WiFi 峰值,总纲 §8)
  schedule?: Schedule; // 全局默认时段
  params?: unknown; // 全局默认参数(深合并到插件默认)
  devices: DeviceEntry[];
}

/** 规整后的一台:URL 已拼,参数/时段已解析并校验。 */
export interface ResolvedDevice {
  id: string;
  udid: string;
  wdaUrl: string;
  name: string;
  size?: Size;
  params: unknown;
  schedule: Schedule;
}

export interface ResolvedConfig {
  vlm: { url: string; model: string; timeoutMs?: number };
  wdaTimeoutMs?: number;
  staggerMs: number;
  devices: ResolvedDevice[];
}

/** 插件相关的注入点(config 层不 import 任何插件)。 */
export interface ConfigPluginHooks {
  defaultParams: unknown;
  validateParams(p: unknown): void;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * 深合并:两个普通对象逐键递归合并;数组与标量整体替换(over 覆盖 base)。
 * 用于「插件默认 ← 全局 params ← 每台 params」三层叠加(如只改某台的 dm.dmDailyCap)。
 */
export function deepMerge(base: unknown, over: unknown): unknown {
  if (over === undefined) return base;
  if (!isPlainObject(base) || !isPlainObject(over)) return over;
  const out: Record<string, unknown> = { ...base };
  for (const k of Object.keys(over)) out[k] = deepMerge(base[k], over[k]);
  return out;
}

function validateSchedule(s: Schedule, where: string): void {
  if (typeof s?.allDay !== "boolean") throw new Error(`${where}.allDay 必须是布尔`);
  if (!s.allDay) validateWindows(s.windows); // allDay=true 时 windows 可空
}

function validateSize(size: Size, where: string): void {
  const [w, h] = [size.width, size.height];
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1) {
    throw new Error(`${where} 必须是正整数 {width,height}`);
  }
}

/**
 * 解析 + 校验 + 规整 master 配置。任何非法处**启动即抛**(fail-fast),
 * 绝不让一台配错静默拖垮或连错手机(D2 探活同精神)。
 */
export function parseConfig(raw: unknown, hooks: ConfigPluginHooks): ResolvedConfig {
  if (!isPlainObject(raw)) throw new Error("配置根必须是对象");
  const c = raw as unknown as MasterConfigFile;

  const url = c.vlm?.url;
  if (!url || typeof url !== "string") throw new Error("vlm.url 缺失(GPU 感知服务地址)");
  if (!Array.isArray(c.devices) || c.devices.length === 0) throw new Error("devices 至少 1 台");
  if (c.staggerMs !== undefined && (!Number.isFinite(c.staggerMs) || c.staggerMs < 0)) {
    throw new Error("staggerMs 必须 ≥ 0");
  }

  const globalSchedule: Schedule = c.schedule ?? { allDay: false, windows: DEFAULT_WINDOWS };
  validateSchedule(globalSchedule, "schedule");

  const ids = new Set<string>();
  const udids = new Set<string>();
  const urls = new Set<string>();
  const devices: ResolvedDevice[] = c.devices.map((d, i) => {
    const at = `devices[${i}]`;
    if (!d.id || typeof d.id !== "string") throw new Error(`${at}.id 缺失`);
    const tag = `${at}(${d.id})`;
    if (!d.udid || typeof d.udid !== "string") throw new Error(`${tag}.udid 缺失(D2:配置表须含 UDID)`);
    if (!d.host || typeof d.host !== "string") throw new Error(`${tag}.host 缺失`);
    const port = d.port ?? DEFAULT_WDA_PORT;
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`${tag}.port 非法: ${port}`);
    const wdaUrl = `http://${d.host}:${port}`;
    if (ids.has(d.id)) throw new Error(`重复 id: ${d.id}`);
    if (udids.has(d.udid)) throw new Error(`重复 udid: ${d.udid}`);
    if (urls.has(wdaUrl)) throw new Error(`重复地址(两台配了同 IP:port?): ${wdaUrl}`);
    ids.add(d.id);
    udids.add(d.udid);
    urls.add(wdaUrl);

    const schedule = d.schedule ?? globalSchedule;
    if (d.schedule) validateSchedule(schedule, `${tag}.schedule`);
    if (d.size) validateSize(d.size, `${tag}.size`);

    const params = deepMerge(deepMerge(hooks.defaultParams, c.params), d.params);
    try {
      hooks.validateParams(params);
    } catch (e) {
      throw new Error(`${tag} 参数非法: ${(e as Error).message}`);
    }
    return { id: d.id, udid: d.udid, wdaUrl, name: d.name ?? d.id, size: d.size, params, schedule };
  });

  return {
    vlm: { url, model: c.vlm.model ?? DEFAULT_VLM_MODEL, timeoutMs: c.vlm.timeoutMs },
    wdaTimeoutMs: c.wdaTimeoutMs,
    staggerMs: c.staggerMs ?? DEFAULT_STAGGER_MS,
    devices,
  };
}
