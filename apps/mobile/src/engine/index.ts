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

export interface EngineDeps {
  params: AutomationParams;
  ui: TikTokUI;
  gen: CommentGenerator;
  logger: Logger;
}

export interface Engine {
  start(): Promise<void>;
  stop(): void;
  getStats(): RunStats;
  isRunning(): boolean;
  /** 当前正在跑的模块（forYou/kwSearch/persHome），未跑则 undefined。 */
  getModule(): string | undefined;
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

function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/**
 * 创建编排引擎。负责：分时段调度、按占比分发推荐页/搜索页、每天一次个人主页、安全停止。
 * 真正的界面操作由注入的 ui 完成；评论内容由 gen 生成。
 */
export function createEngine(deps: EngineDeps): Engine {
  const { params, ui, gen, logger } = deps;
  let stopped = false;
  let running = false;
  const stats = emptyStats();
  let persHomeRanOn: string | null = null;
  let currentModule: string | undefined;

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
    params,
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

        try {
          // 脱困：每个批次开始前先回到"基地"（推荐流干净状态）。
          // 失败/异常会被本 try 捕获 → 退避重试。
          if (ui.recoverToFeed) await ui.recoverToFeed();

          // 个人主页：每天仅一次，时间段内优先处理。
          // 先标记"今天已尝试"再执行：即便失败也不会整天反复重试（配合下方容错）。
          if (params.persHome.moduleEnable && persHomeRanOn !== todayKey()) {
            persHomeRanOn = todayKey();
            currentModule = "persHome";
            await runPersHome(ctx, ui, gen);
          } else {
            // 按搜索占比分发一个批次。
            const kind = pickModule(params.kwSearchExecRatio);
            if (kind === "kwSearch") {
              currentModule = "kwSearch";
              await runKwSearch(ctx, ui, gen, randInt(3, 8));
            } else {
              currentModule = "forYou";
              await runForYou(ctx, ui, gen, randInt(5, 15));
            }
          }

          consecutiveErrors = 0;
          // 批次间兜底间隔：防止"空批次"零延迟热循环 + 拟人化停顿。
          await interruptibleSleep(jitter(MIN_BATCH_GAP));
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
        }
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
  };
}

export { emptyStats } from "./types";
export type { RunContext, RunStats, Logger, CommentGenerator } from "./types";
export { createStubUI } from "./tiktok-ui";
export type { TikTokUI } from "./tiktok-ui";
