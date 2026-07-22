/**
 * 登录限流（纯逻辑，便于单测）：按 key（客户端 IP）在滑动窗口内记失败次数，触顶就锁一段时间。
 * 目的：挡住对管理端 /admin/login 的在线爆破（尤其默认口令）。成功登录清零。
 * 按 IP 计数（而非用户名）避免攻击者用错误口令把真管理员锁死。
 */
export interface ThrottleEntry {
  fails: number;
  windowStart: number;
  lockedUntil: number;
}
export interface ThrottleOpts {
  /** 窗口内允许的最大失败次数。 */
  maxFails: number;
  /** 计数窗口（ms）。 */
  windowMs: number;
  /** 触顶后锁定时长（ms）。 */
  lockMs: number;
}

export const DEFAULT_THROTTLE: ThrottleOpts = {
  maxFails: 8,
  windowMs: 10 * 60_000,
  lockMs: 10 * 60_000,
};

export type ThrottleState = Map<string, ThrottleEntry>;

export function createThrottleState(): ThrottleState {
  return new Map();
}

/** 当前剩余锁定秒数（>0 表示被锁）。 */
export function lockedSeconds(state: ThrottleState, key: string, now: number): number {
  const e = state.get(key);
  if (!e || e.lockedUntil <= now) return 0;
  return Math.ceil((e.lockedUntil - now) / 1000);
}

/** 记一次登录失败；窗口内累计到 maxFails 则上锁并重置计数。 */
export function recordFailure(
  state: ThrottleState,
  key: string,
  now: number,
  opts: ThrottleOpts = DEFAULT_THROTTLE,
): void {
  const e = state.get(key);
  if (!e || now - e.windowStart > opts.windowMs) {
    state.set(key, { fails: 1, windowStart: now, lockedUntil: 0 });
    return;
  }
  e.fails += 1;
  if (e.fails >= opts.maxFails) {
    e.lockedUntil = now + opts.lockMs; // 上锁
    e.fails = 0; // 锁解除后从头计
    e.windowStart = now;
  }
}

/** 登录成功 → 清掉该 key 的失败记录。 */
export function recordSuccess(state: ThrottleState, key: string): void {
  state.delete(key);
}
