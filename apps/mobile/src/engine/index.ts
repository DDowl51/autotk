import type { AutomationParams } from "../params/types";
import { validateParams } from "../params/parse";
import {
  isWithinAnyWindow,
  pickModule,
  secondsUntilNextWindow,
} from "./scheduler";
import { emptyStats, type CommentGenerator, type Logger, type RunContext, type RunStats } from "./types";
import type { TikTokUI } from "./tiktok-ui";
import { jitter, randInt } from "./random";
import { runForYou } from "./modules/forYou";
import { runKwSearch } from "./modules/kwSearch";
import { runPersHome } from "./modules/persHome";
import { runFollowingFeed } from "./modules/followingFeed";
import { withTimeout } from "./timeout";

export interface EngineDeps {
  params: AutomationParams;
  ui: TikTokUI;
  gen: CommentGenerator;
  logger: Logger;
  /**
   * 是否暂停养号（true = 有别的流程正在驱动同一手机的 WDA/前台，如「远程下发发布」）。
   * 引擎在每个批次开始前查一次：暂停中就空转、不开新批次，避免养号与发布抢前台互相踩。
   */
  isPaused?: () => boolean;
}

export interface Engine {
  start(): Promise<void>;
  stop(): void;
  getStats(): RunStats;
  isRunning(): boolean;
  /** 当前正在跑的模块（forYou/kwSearch/persHome），未跑则 undefined。 */
  getModule(): string | undefined;
  /**
   * 引擎是否正忙于驱动 WDA（某批模块正在执行）。发布流程据此**等当前批次跑完再插入**，
   * 从而与养号完全串行、不并发驱动同一手机。批次间隔/退避/暂停等空闲期返回 false。
   */
  isBusy(): boolean;
  /**
   * 热更运行参数：下发配置 / 本地改设置后调用，**运行中即时生效**（不必停机重建）。
   * gen 可选：fixedReplies 变了就传一个新的固定回复生成器进来。
   */
  updateParams(next: AutomationParams, gen?: CommentGenerator): void;
}

/** 不在时间段内时，每隔这么久重新检查一次（秒）。 */
const IDLE_POLL_SECONDS = 30;

/** 批次之间的最小间隔（秒，含抖动）。兜底,防止"空批次"零延迟热循环。 */
const MIN_BATCH_GAP = 1.5;
/** 单次批次失败后的退避封顶（秒）。 */
const MAX_BACKOFF_SECONDS = 60;
/** 连续失败达到此次数 → 进入长冷却（熔断），而非继续高频重试。 */
const CIRCUIT_THRESHOLD = 5;
/** 熔断后的长冷却时长（秒）。 */
const CIRCUIT_COOLDOWN_SECONDS = 300;
/** 单批模块执行上限（秒）：WDA 卡住/无响应超过此值即超时进退避，不永久挂住。 */
const MODULE_TIMEOUT_SECONDS = 300;

function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/**
 * 创建编排引擎。负责：分时段调度、按占比分发推荐页/搜索页、每天一次个人主页、安全停止。
 * 真正的界面操作由注入的 ui 完成；评论内容由 gen 生成。
 */
export function createEngine(deps: EngineDeps): Engine {
  const { ui, logger } = deps;
  // 可变，供 updateParams 热更；ctx/循环/模块调用都读这两个变量，改一处全生效。
  let params = deps.params;
  let gen = deps.gen;
  let stopped = false;
  let running = false;
  const stats = emptyStats();
  let persHomeRanOn: string | null = null;
  let currentModule: string | undefined;
  // 本批是否正在驱动 WDA（供发布等它跑完再插入，见 isBusy）。批次间隔/退避/暂停期为 false。
  let moduleRunning = false;

  // 可被打断的休眠：停止时立即唤醒，无需等满整个间隔。
  // 空转等待与模块内的拟人化停顿都走这里，保证停止响应及时。
  let wake: (() => void) | null = null;
  function interruptibleSleep(seconds: number): Promise<void> {
    if (stopped) return Promise.resolve();
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        wake = null;
        resolve();
      }, seconds * 1000);
      wake = () => {
        clearTimeout(t);
        wake = null;
        resolve();
      };
    });
  }

  const ctx: RunContext = {
    // getter：模块每次读到的是最新 params（updateParams 热更后即时生效）。
    get params() {
      return params;
    },
    stats,
    logger,
    shouldStop: () => stopped,
    withinWindow: () => !!params.allDay || isWithinAnyWindow(params.taskWindows),
    sleep: interruptibleSleep,
  };

  async function start(): Promise<void> {
    const errors = validateParams(params);
    if (errors.length > 0) {
      throw new Error("参数校验未通过：\n" + errors.join("\n"));
    }

    stopped = false;
    running = true;
    logger.log("info", "引擎启动");

    let idleLogged = false;
    let consecutiveErrors = 0;

    // 养号一批：按搜索占比分发推荐页 / 搜索页。
    const runGrooming = async () => {
      const kind = pickModule(params.kwSearchExecRatio);
      if (kind === "kwSearch") {
        currentModule = "kwSearch";
        await withTimeout(runKwSearch(ctx, ui, gen, randInt(3, 8)), MODULE_TIMEOUT_SECONDS);
      } else {
        currentModule = "forYou";
        await withTimeout(runForYou(ctx, ui, gen, randInt(5, 15)), MODULE_TIMEOUT_SECONDS);
      }
    };

    try {
      while (!stopped) {
        if (!params.allDay && !isWithinAnyWindow(params.taskWindows)) {
          if (!idleLogged) {
            logger.log("info", "当前不在任务时间段内，等待到点…");
            idleLogged = true;
          }
          const wait = Math.min(
            secondsUntilNextWindow(params.taskWindows),
            IDLE_POLL_SECONDS,
          );
          await interruptibleSleep(wait);
          continue;
        }
        idleLogged = false;

        // 发布正在驱动 WDA（同一手机前台）→ 养号暂停、不开新批次，避免两者抢前台互相踩。
        if (deps.isPaused?.()) {
          await interruptibleSleep(1);
          continue;
        }

        try {
          moduleRunning = true; // 本批开始驱动 WDA（发布会等到此为 false 再插入）
          // 脱困：每个批次开始前先回到"基地"（推荐流干净状态）。
          // 失败/异常会被本 try 捕获 → 退避重试。
          if (ui.recoverToFeed) await ui.recoverToFeed();

          // 「监控关注」开关与日常养号**互斥**：
          //   开 = 纯打粉，只跑关注流、暂停养号（推荐/搜索/个人主页都不跑）；
          //   关 = 日常养号（个人主页每天一次 + 推荐/搜索按比例）。
          if (params.following.moduleEnable) {
            currentModule = "following";
            await withTimeout(runFollowingFeed(ctx, ui, gen, randInt(3, 8)), MODULE_TIMEOUT_SECONDS);
          } else if (params.persHome.moduleEnable && persHomeRanOn !== todayKey()) {
            // 个人主页：每天仅一次，时间段内优先。先标记"今天已尝试"再执行，避免失败整天重试。
            persHomeRanOn = todayKey();
            currentModule = "persHome";
            await withTimeout(runPersHome(ctx, ui, gen), MODULE_TIMEOUT_SECONDS);
          } else {
            await runGrooming();
          }

          consecutiveErrors = 0;
        } catch (e) {
          // 单次批次失败不杀引擎：退避重试；连续失败过多 → 长冷却（熔断）。
          consecutiveErrors++;
          const msg = e instanceof Error ? e.message : String(e);
          if (consecutiveErrors >= CIRCUIT_THRESHOLD) {
            logger.log(
              "error",
              `连续 ${consecutiveErrors} 次失败，进入 ${CIRCUIT_COOLDOWN_SECONDS}s 冷却：${msg}`,
            );
            await interruptibleSleep(CIRCUIT_COOLDOWN_SECONDS);
            consecutiveErrors = 0; // 冷却后清零，再给一次机会
          } else {
            const backoff = Math.min(MAX_BACKOFF_SECONDS, 2 ** consecutiveErrors);
            logger.log(
              "warn",
              `批次出错（第 ${consecutiveErrors} 次），退避 ${backoff}s 后重试：${msg}`,
            );
            await interruptibleSleep(backoff);
          }
        } finally {
          moduleRunning = false; // 本批结束（成功/出错都）→ 进入空闲，允许发布插入
        }
        // 批次间兜底间隔：防"空批次"零延迟热循环 + 拟人化停顿（成功/退避后都走）。
        await interruptibleSleep(jitter(MIN_BATCH_GAP));
      }
    } finally {
      running = false;
      logger.log("info", "引擎停止");
    }
  }

  return {
    start,
    stop: () => {
      stopped = true;
      wake?.();
    },
    getStats: () => ({ ...stats }),
    isRunning: () => running,
    getModule: () => currentModule,
    isBusy: () => moduleRunning,
    updateParams: (next, g) => {
      params = next;
      if (g) gen = g;
    },
  };
}

export { emptyStats } from "./types";
export type { RunContext, RunStats, Logger, CommentGenerator } from "./types";
export { createStubUI } from "./tiktok-ui";
export type { TikTokUI } from "./tiktok-ui";
