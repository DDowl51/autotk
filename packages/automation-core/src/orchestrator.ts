// 多机编排(L3 §3 语义 1:1 复刻):每台手机一个主循环——
//   时段窗 → 暂停(发布独占)→ 模块选择(插件钩子)→ 批次(超时隔离 batchGen)→ 退避+熔断。
// 时钟/休眠/看门狗全注入,离线可测;真实装配见 services/master。
// 「模块互斥优先级」是业务语义,由插件经 pickWorkflow 提供;core 只管循环与自愈。
import { createRunContext, emptyStats, type RunContext, type RunStats } from "./context";
import { runWorkflow, type Plugin } from "./plugin";
import { toRegistry } from "./target";
import { isWithinAnyWindow, secondsUntilNextWindow, type TimeWindow } from "./schedule";
import { jitter, type Rng } from "./human";
import type { Perceptor, StateStore, Driver } from "./interfaces";
import type { Size } from "./geometry";

// L3 §3.5 常量(秒)。
export const IDLE_POLL_S = 30;
export const MIN_BATCH_GAP_S = 1.5;
export const MAX_BACKOFF_S = 60;
export const CIRCUIT_THRESHOLD = 5;
export const CIRCUIT_COOLDOWN_S = 300;
export const MODULE_TIMEOUT_MS = 300_000;

/** 插件的批次选择钩子:返回本批工作流名;null=本批无事可做(睡 IDLE_POLL)。 */
export type WorkflowPicker = (params: unknown, view: { ranToday(name: string): boolean }) => string | null;

export interface Schedule {
  allDay: boolean;
  windows: TimeWindow[];
}

export interface PhoneConfig {
  id: string;
  driver: Driver;
  size: Size;
  params: unknown;
  schedule: Schedule;
  /** 错峰:启动前先睡这么久(平滑 GPU/WiFi 峰值,总纲 §8)。 */
  phaseOffsetMs?: number;
}

export interface FleetDeps {
  plugin: Plugin;
  pickWorkflow: WorkflowPicker;
  /** 这些工作流每日至多一次;被选中即先标记(先写 key 再执行,失败当天不重试,L3 §3.4)。 */
  oncePerDay?: string[];
  /** 每批开头先跑的复位工作流(回基地,L3 §3.2-4);失败=批异常走退避。 */
  recoverWorkflow?: string;
  perceptor: Perceptor;
  state: StateStore;
  now(): number; // epoch ms
  daySeconds(): number; // 设备本地「当天秒数」
  todayKey(): string; // 'YYYY-M-D'
  sleep(ms: number): Promise<void>;
  /** 模块硬超时看门狗;默认真实 setTimeout。测试注入假实现手动触发。返回取消函数。 */
  watchdog?(ms: number, onTimeout: () => void): () => void;
  moduleTimeoutMs?: number;
  rng?: Rng;
  pollMs?: number;
  log?(phoneId: string, msg: string): void;
  onEvent?(phoneId: string, evt: string, data?: unknown): void;
}

export interface PhoneHandle {
  readonly id: string;
  /** 请求停止:置停 + 废当前批 + 唤醒一切休眠。等 done 确认退出。 */
  stop(): void;
  /** 远程暂停(启停控制):挂起批循环 + 废当前批(最近检查点停在原地)。不退出循环。 */
  pause(): void;
  /** 远程恢复:唤醒批循环;下一批先 recover 回基地再跑。 */
  resume(): void;
  isPaused(): boolean;
  readonly done: Promise<void>;
  /** 当前批在跑(发布等独占方等它变假再插)。 */
  isBusy(): boolean;
  /** 当前批工作流名(不在批中为 null)。 */
  getModule(): string | null;
  getStats(): RunStats;
  getAlert(): string | null;
  /** 热更参数:立即校验(失败抛错不生效),下批生效(L3 §3.2-3)。 */
  updateParams(p: unknown): void;
  updateSchedule(s: Schedule): void;
  /**
   * 独占运行(发布任务等):暂停批循环 → 等当前批跑完 → 独占驱动执行 fn(养号与发布串行不抢前台)。
   * fn 里用传入的 ctx(带本插件全局危险)。结束自动恢复批循环。
   */
  runExclusive<T>(name: string, fn: (ctx: RunContext) => Promise<T>): Promise<T>;
}

function realWatchdog(ms: number, onTimeout: () => void): () => void {
  const t = setTimeout(onTimeout, ms);
  return () => clearTimeout(t);
}

export function startPhone(cfg: PhoneConfig, deps: FleetDeps): PhoneHandle {
  const rng = deps.rng ?? Math.random;
  const registry = toRegistry(deps.plugin.targets);
  let stopped = false;
  let userPaused = false; // 远程启停:挂起批循环(区别于 runExclusive 的 paused)
  let batchGen = 0; // 单调批代号:废批的 shouldStop 永真(布尔复位会复活,L3 §3.5)
  let paused = 0; // runExclusive 计数
  let busy = false;
  let module: string | null = null;
  let alert: string | null = null;
  let errors = 0; // 连续失败批数
  let params = cfg.params;
  let schedule = cfg.schedule;
  const stats = emptyStats();
  const ranOn = new Map<string, string>(); // 工作流 → 已跑日期 key
  const wakers = new Set<() => void>();

  const wakeAll = (): void => {
    for (const w of wakers) w();
    wakers.clear();
  };
  /** 可打断休眠:stop() 立即唤醒(L3 §3.5 interruptibleSleep)。 */
  const isleep = (ms: number): Promise<void> => {
    if (stopped) return Promise.resolve();
    return new Promise((resolve) => {
      wakers.add(resolve);
      void deps.sleep(ms).then(() => {
        wakers.delete(resolve);
        resolve();
      });
    });
  };

  const withinWindow = (): boolean => schedule.allDay || isWithinAnyWindow(schedule.windows, deps.daySeconds());

  const engineDeps = (myGen: number) => ({
    driver: cfg.driver,
    perceptor: deps.perceptor,
    targets: registry,
    size: cfg.size,
    now: deps.now,
    sleep: deps.sleep,
    shouldStop: () => stopped || batchGen !== myGen,
    pollMs: deps.pollMs,
    log: (m: string) => deps.log?.(cfg.id, m),
    onEvent: (e: string, d?: unknown) => deps.onEvent?.(cfg.id, e, d),
    params,
    state: deps.state,
    withinWindow,
    rng,
    stats,
  });

  /** 跑一批:健康守卫 → 复位回基地 → 工作流;看门狗超时即废批(残留 await 在下个检查点自退)。 */
  async function runBatch(wf: string): Promise<void> {
    const myGen = ++batchGen;
    await cfg.driver.ensureHealthy();
    await cfg.driver.activateApp(deps.plugin.appId);
    const wd = deps.watchdog ?? realWatchdog;
    await new Promise<void>((resolve, reject) => {
      const cancel = wd(deps.moduleTimeoutMs ?? MODULE_TIMEOUT_MS, () => {
        if (batchGen === myGen) batchGen++; // 废批:绝不与新批并发驱动同一手机
        reject(new Error(`模块超时: ${wf}`));
      });
      const run = async (): Promise<void> => {
        if (deps.recoverWorkflow && deps.recoverWorkflow !== wf) {
          await runWorkflow(deps.plugin, deps.recoverWorkflow, engineDeps(myGen));
        }
        await runWorkflow(deps.plugin, wf, engineDeps(myGen));
      };
      run().then(
        () => {
          cancel();
          resolve();
        },
        (e: unknown) => {
          cancel();
          if (batchGen === myGen) reject(e instanceof Error ? e : new Error(String(e)));
          else resolve(); // 已被废批(超时/停止),迟到的错误不再上抛
        },
      );
    });
  }

  const done = (async () => {
    // 启动前校验,有错不启动(L3 §3.2)
    try {
      deps.plugin.validateParams(params);
    } catch (e) {
      alert = `参数校验失败,未启动: ${(e as Error).message}`;
      deps.onEvent?.(cfg.id, "alert", alert);
      return;
    }
    if (cfg.phaseOffsetMs) await isleep(cfg.phaseOffsetMs);
    let waitLogged = false;
    while (!stopped) {
      // ⓪ 远程暂停(启停控制):挂起批循环,停在原地;恢复后下批先 recover 回基地。
      if (userPaused) {
        await isleep(IDLE_POLL_S * 1000);
        continue;
      }
      // ① 时段窗
      if (!withinWindow()) {
        if (!waitLogged) {
          deps.log?.(cfg.id, "不在运行时段,等待到点");
          waitLogged = true;
        }
        await isleep(Math.min(secondsUntilNextWindow(schedule.windows, deps.daySeconds()), IDLE_POLL_S) * 1000);
        continue;
      }
      waitLogged = false;
      // ② 独占暂停(发布正驱动同一手机前台)
      if (paused > 0) {
        await isleep(1000);
        continue;
      }
      // ③ 模块选择(业务互斥语义在插件)
      const wf = deps.pickWorkflow(params, { ranToday: (n) => ranOn.get(n) === deps.todayKey() });
      if (!wf) {
        await isleep(IDLE_POLL_S * 1000);
        continue;
      }
      if (deps.oncePerDay?.includes(wf)) ranOn.set(wf, deps.todayKey()); // 先写 key 再执行
      // ④ 跑批
      let failed = false;
      busy = true;
      module = wf;
      try {
        await runBatch(wf);
        errors = 0;
        alert = null;
      } catch (e) {
        failed = true;
        errors++;
        alert = `批次异常(${wf}): ${(e as Error).message}`;
        deps.onEvent?.(cfg.id, "batch_error", { workflow: wf, error: (e as Error).message, consecutive: errors });
      } finally {
        busy = false;
        module = null;
      }
      // ⑤ 退避 + 熔断(L3 §3.5)
      if (failed) {
        if (errors >= CIRCUIT_THRESHOLD) {
          deps.onEvent?.(cfg.id, "circuit_open", { cooldownS: CIRCUIT_COOLDOWN_S });
          await isleep(CIRCUIT_COOLDOWN_S * 1000);
          errors = 0;
        } else {
          await isleep(Math.min(MAX_BACKOFF_S, 2 ** errors) * 1000);
        }
        continue;
      }
      // ⑥ 批间隔
      await isleep(jitter(MIN_BATCH_GAP_S, 0.3, rng) * 1000);
    }
  })();

  return {
    id: cfg.id,
    stop() {
      stopped = true;
      batchGen++; // 废在跑批
      wakeAll();
    },
    pause() {
      userPaused = true;
      batchGen++; // 废当前批 → 最近检查点停下(停在原地,恢复时 recover 回基地)
      wakeAll();
    },
    resume() {
      userPaused = false;
      wakeAll(); // 唤醒 idle 中的批循环
    },
    isPaused: () => userPaused,
    done,
    isBusy: () => busy,
    getModule: () => module,
    getStats: () => stats,
    getAlert: () => alert,
    updateParams(p) {
      deps.plugin.validateParams(p); // 失败抛错,不生效
      params = p;
    },
    updateSchedule(s) {
      schedule = s;
    },
    async runExclusive<T>(name: string, fn: (ctx: RunContext) => Promise<T>): Promise<T> {
      paused++;
      try {
        while (busy && !stopped) await isleep(500); // 等当前批跑完(串行不抢前台)
        if (stopped) throw new Error(`手机已停止: ${cfg.id}`);
        const myGen = ++batchGen;
        busy = true;
        module = name;
        try {
          await cfg.driver.ensureHealthy();
          await cfg.driver.activateApp(deps.plugin.appId);
          const ctx = createRunContext({
            ...engineDeps(myGen),
            globalHazards: deps.plugin.activation.globalHazards,
            stats,
          });
          return await fn(ctx);
        } finally {
          busy = false;
          module = null;
        }
      } finally {
        paused--;
      }
    },
  };
}

export interface Fleet {
  add(cfg: PhoneConfig): PhoneHandle;
  get(id: string): PhoneHandle | undefined;
  list(): PhoneHandle[];
  /** 停一台并等退出。 */
  remove(id: string): Promise<void>;
  stopAll(): Promise<void>;
}

export function createFleet(deps: FleetDeps): Fleet {
  const phones = new Map<string, PhoneHandle>();
  return {
    add(cfg) {
      if (phones.has(cfg.id)) throw new Error(`重复的手机 id: ${cfg.id}`);
      const h = startPhone(cfg, deps);
      phones.set(cfg.id, h);
      return h;
    },
    get: (id) => phones.get(id),
    list: () => [...phones.values()],
    async remove(id) {
      const h = phones.get(id);
      if (!h) return;
      phones.delete(id);
      h.stop();
      await h.done;
    },
    async stopAll() {
      const all = [...phones.values()];
      for (const h of all) h.stop();
      await Promise.all(all.map((h) => h.done));
      phones.clear();
    },
  };
}
