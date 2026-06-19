import type { AutomationParams } from "../params/types";
import { validateParams } from "../params/parse";
import {
  isWithinAnyWindow,
  pickModule,
  secondsUntilNextWindow,
} from "./scheduler";
import { emptyStats, type CommentGenerator, type Logger, type RunContext, type RunStats } from "./types";
import type { TikTokUI } from "./tiktok-ui";
import { randInt } from "./random";
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
}

/** 不在时间段内时，每隔这么久重新检查一次（秒）。 */
const IDLE_POLL_SECONDS = 30;

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
    try {
      while (!stopped) {
        if (!isWithinAnyWindow(params.taskWindows)) {
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

        // 个人主页：每天仅一次，时间段内优先处理。
        if (params.persHome.moduleEnable && persHomeRanOn !== todayKey()) {
          await runPersHome(ctx, ui, gen);
          persHomeRanOn = todayKey();
          continue;
        }

        // 按搜索占比分发一个批次。
        const kind = pickModule(params.kwSearchExecRatio);
        if (kind === "kwSearch") {
          await runKwSearch(ctx, ui, gen, randInt(3, 8));
        } else {
          await runForYou(ctx, ui, gen, randInt(5, 15));
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
  };
}

export { emptyStats } from "./types";
export type { RunContext, RunStats, Logger, CommentGenerator } from "./types";
export { createStubUI } from "./tiktok-ui";
export type { TikTokUI } from "./tiktok-ui";
