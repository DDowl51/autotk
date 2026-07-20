// RunContext:插件写工作流(L3)用的 API。把引擎/感知/拟人/状态收成一个门面,
// 工作流不直接碰 EngineDeps。全部依赖注入 → 工作流也能 mock 感知离线测。
import { locateTargets, runStep, tapTargetNow, type EngineDeps, type StepResult } from "./engine";
import { chance, jitter, pick, type Rng } from "./human";
import { centerPx, type Box, type Point, type Size } from "./geometry";
import type { Hit, StateStore, TextLine } from "./interfaces";
import type { Step } from "./step";

/** 一次运行的累计统计(上报 Hub「每日任务记录」)。 */
export interface RunStats {
  videosWatched: number;
  likes: number;
  saves: number;
  follows: number;
  commentLikes: number;
  commentReplies: number;
  dmSent: number;
  /** 私信尝试失败数(打开私信/输入/发送失败;P3 决策记录 2026-07-20:失败必须留痕)。 */
  dmFailed: number;
}
export function emptyStats(): RunStats {
  return { videosWatched: 0, likes: 0, saves: 0, follows: 0, commentLikes: 0, commentReplies: 0, dmSent: 0, dmFailed: 0 };
}

export interface RunContext {
  /** 跑一步(自动并入插件全局危险);返回 ok/stopped/recover/alert。 */
  runStep(step: Step): Promise<StepResult>;
  /** 快捷:定位+点一个目标,返回是否点到(没定位到=false,如已点赞则无「白心」)。 */
  tapTarget(id: string): Promise<boolean>;
  /** 探测一组目标当前是否在场 → id→Hit(缺席不在 Map)。用于选择/兼验(如挑非直播非广告结果)。 */
  locate(ids: string[]): Promise<Map<string, Hit>>;
  /** 动态定位:按任意短语(非注册表目标)找 → 像素中心或 null。评论级/私信级用(如「评论X的头像」)。 */
  find(phrase: string, region?: Box): Promise<Point | null>;
  /** find + 点;返回是否点到。 */
  findAndTap(phrase: string, region?: Box): Promise<boolean>;
  /** OCR 读文本(评论/文案),返回各行文字。 */
  readText(region?: Box): Promise<string[]>;
  /** OCR 读文本 + 坐标(评论解析要 y 位置)。 */
  readLines(region?: Box): Promise<TextLine[]>;
  /** 屏幕逻辑分辨率(工作流算手势坐标用)。 */
  readonly size: Size;
  /** 低层滑动(像素;面板内滚动等)。 */
  swipe(from: Point, to: Point, durMs?: number): Promise<void>;
  /** 拟人化随机(rng 可注入)。 */
  chance(p: number): boolean;
  jitter(seconds: number, ratio?: number): number;
  /** 数组随机取一(空→undefined)。 */
  pick<T>(arr: readonly T[]): T | undefined;
  /** 原始随机数 [0,1)(话术占位符展开等用)。 */
  random(): number;
  /** 真休眠(拟人观看/停顿;不是等加载——等加载用 runStep 的 verify 轮询)。 */
  sleepSeconds(seconds: number): Promise<void>;
  /** 业务参数(插件强转成自己的类型)。 */
  readonly params: unknown;
  readonly state: StateStore;
  readonly stats: RunStats;
  shouldStop(): boolean;
  withinWindow(): boolean;
  log(m: string): void;
}

export interface RunContextDeps extends EngineDeps {
  /** 插件全局危险目标 id(每步都查)。 */
  globalHazards: string[];
  params: unknown;
  state: StateStore;
  stats: RunStats;
  withinWindow: () => boolean;
  rng?: Rng;
}

function mergeHazards(step: Step, global: string[]): Step {
  if (global.length === 0) return step;
  const set = new Set([...global, ...step.hazards]);
  return { ...step, hazards: [...set] };
}

export function createRunContext(d: RunContextDeps): RunContext {
  const rng: Rng = d.rng ?? Math.random;
  const find = async (phrase: string, region?: Box): Promise<Point | null> => {
    const shot = await d.driver.screenshot();
    const q = region ? [{ id: "_find", phrase, region }] : [{ id: "_find", phrase }];
    const hit = (await d.perceptor.locate(shot, q)).find((h) => h.id === "_find");
    return hit ? centerPx(hit.box, d.size) : null;
  };
  const readLines = async (region?: Box): Promise<TextLine[]> => {
    return d.perceptor.readText(await d.driver.screenshot(), region);
  };
  return {
    runStep: (step) => runStep(mergeHazards(step, d.globalHazards), d),
    tapTarget: async (id) => (await tapTargetNow(d, id)) !== null,
    locate: (ids) => locateTargets(d, ids),
    find,
    findAndTap: async (phrase, region) => {
      const p = await find(phrase, region);
      if (!p) return false;
      await d.driver.tap(p);
      return true;
    },
    readText: async (region) => (await readLines(region)).map((l) => l.text),
    readLines,
    size: d.size,
    swipe: (from, to, durMs) => d.driver.swipe(from, to, durMs ?? 250),
    chance: (p) => chance(p, rng),
    jitter: (seconds, ratio) => jitter(seconds, ratio ?? 0.3, rng),
    pick: (arr) => pick(arr, rng),
    random: () => rng(),
    sleepSeconds: (seconds) => d.sleep(Math.round(seconds * 1000)),
    params: d.params,
    state: d.state,
    stats: d.stats,
    shouldStop: d.shouldStop,
    withinWindow: d.withinWindow,
    log: (m) => d.log?.(m),
  };
}
