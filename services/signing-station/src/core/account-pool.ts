/**
 * 账号池分配（纯逻辑）。
 *
 * 超级签的容量模型：每个开发者账号最多 100 台 iPhone/会员年。池 = N 个账号，
 * 新设备分配到「还有空位」的账号；同一账号下所有设备共用一份重签 IPA。
 *
 * 这里只管「该把这台 UDID 放进哪个账号」的决策，纯函数、可单测；
 * 真正调 ASC API 注册、落盘由编排层（signing-orchestrator）+ 适配器做。
 *
 * N=1 即单账号版：池里只放一个账号，同样的代码、无分支。
 */

export interface PoolAccount {
  /** 账号标识（accounts.json 里的 name）。 */
  name: string;
  /** 该账号设备额度，默认 100。 */
  capacity: number;
  /** 已注册的 UDID（归一化后的小写串）。 */
  devices: string[];
}

export type PickResult =
  | { ok: true; account: string; alreadyRegistered: boolean }
  | { ok: false; reason: "pool-full" };

/** UDID 归一化：去空白 + 小写，保证比较/查重一致。 */
export function normalizeUdid(udid: string): string {
  return udid.trim().toLowerCase();
}

/** 某账号剩余可注册名额。 */
export function freeCapacity(account: PoolAccount): number {
  return account.capacity - account.devices.length;
}

/** 账号是否已含某 UDID。 */
export function hasDevice(account: PoolAccount, udid: string): boolean {
  const n = normalizeUdid(udid);
  return account.devices.some((d) => normalizeUdid(d) === n);
}

/**
 * 决定该 UDID 分到哪个账号：
 * 1. 已经注册过该 UDID 的账号 → 直接用它（alreadyRegistered=true，无需再注册/重签）。
 * 2. 否则挑剩余名额最多的账号（>0）；并列取靠前的，保证确定性。
 * 3. 全满 → pool-full。
 */
export function pickAccountForUdid(accounts: PoolAccount[], udid: string): PickResult {
  const n = normalizeUdid(udid);
  if (n === "") throw new Error("UDID 不能为空");

  const existing = accounts.find((a) => hasDevice(a, n));
  if (existing) return { ok: true, account: existing.name, alreadyRegistered: true };

  let best: PoolAccount | undefined;
  for (const a of accounts) {
    if (freeCapacity(a) <= 0) continue;
    if (!best || freeCapacity(a) > freeCapacity(best)) best = a;
  }
  if (!best) return { ok: false, reason: "pool-full" };
  return { ok: true, account: best.name, alreadyRegistered: false };
}

/** 整池剩余总名额（看水位、判断是否该加账号）。 */
export function poolFreeCapacity(accounts: PoolAccount[]): number {
  return accounts.reduce((sum, a) => sum + Math.max(0, freeCapacity(a)), 0);
}

/**
 * 把 UDID 记进某账号，返回**新的账号对象**（不可变，便于上层算差异/持久化）。
 * 已存在则原样返回（幂等）。容量已满仍要塞会抛错（调用前应先 pick）。
 */
export function withDeviceRegistered(account: PoolAccount, udid: string): PoolAccount {
  const n = normalizeUdid(udid);
  if (hasDevice(account, n)) return account;
  if (freeCapacity(account) <= 0) {
    throw new Error(`账号 ${account.name} 名额已满，无法再注册 ${n}`);
  }
  return { ...account, devices: [...account.devices, n] };
}
