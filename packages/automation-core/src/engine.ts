// 决策引擎(core,与 app 无关)。每步:观测 → 组合定位 → 危险优先 → 期望执行 → 验证/轮询 → 超时升级。
// 公理 A1–A4 的直接落地。全部依赖经 EngineDeps 注入,便于 mock 截图序列离线单测。
import { centerPx, normPx, type Point, type Size } from "./geometry";
import type { Driver, Hit, LocateQuery, Perceptor } from "./interfaces";
import type { BasicOp, Escalation, Step } from "./step";
import type { HazardClass, Target, TargetRegistry } from "./target";

export const POLL_MS = 400;
export const MAX_HAZARD_HANDLES = 6; // 同一步危险反复出现的熔断

const HAZARD_ORDER: Record<HazardClass, number> = { system: 0, overlay: 1, category: 2 };

export interface EngineDeps {
  driver: Driver;
  perceptor: Perceptor;
  targets: TargetRegistry;
  size: Size;
  /** 可注入时钟/休眠,单测用假实现,不真等。 */
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  shouldStop: () => boolean;
  pollMs?: number;
  log?: (m: string) => void;
  onEvent?: (e: string, d?: unknown) => void;
}

export type DecideOutcome =
  | { status: "ok" }
  | { status: "hazard"; id: string }
  | { status: "stopped" }
  | { status: "timeout" };

function target(deps: EngineDeps, id: string): Target {
  const t = deps.targets.get(id);
  if (!t) throw new Error(`未知 Target: ${id}`);
  return t;
}

function queriesFor(deps: EngineDeps, ids: string[]): LocateQuery[] {
  return ids.map((id) => {
    const t = target(deps, id);
    return t.region ? { id, phrase: t.phrase, region: t.region } : { id, phrase: t.phrase };
  });
}

/** 组合定位一组目标 → id→Hit(缺席不在 Map 里)。供 decide 与工作层(ctx.locate)复用。 */
export async function locateTargets(deps: EngineDeps, ids: string[]): Promise<Map<string, Hit>> {
  if (ids.length === 0) return new Map();
  const shot = await deps.driver.screenshot();
  const hits = await deps.perceptor.locate(shot, queriesFor(deps, ids));
  return new Map(hits.map((h) => [h.id, h]));
}

/**
 * 幻觉治理(P2):VLM 定位到的危险框,若该 Target 带 `ocr`,用 OCR 核对框内**真有对应文字**才算数。
 * 框内读不到匹配文字 = 屏上其实没这个危险(grounding 对不存在目标幻觉出框)→ 判未命中,不处理。
 * 无 `ocr` 的危险(如浮层弹窗的 × 无文字可核)→ 信 VLM。OCR 出错/正则坏 → 不拦(避免漏掉真危险)。
 */
async function hazardConfirmed(deps: EngineDeps, id: string, hit: Hit): Promise<boolean> {
  const ocr = target(deps, id).ocr;
  if (!ocr) return true;
  let re: RegExp;
  try {
    re = new RegExp(ocr, "i");
  } catch {
    return true; // 正则坏 → 不拦
  }
  try {
    const [x1, y1, x2, y2] = hit.box;
    // 稍扩框,容纳按钮文字(VLM 框常贴边)。
    const region: Hit["box"] = [Math.max(0, x1 - 0.03), Math.max(0, y1 - 0.015), Math.min(1, x2 + 0.03), Math.min(1, y2 + 0.015)];
    const lines = await deps.perceptor.readText(await deps.driver.screenshot(), region);
    return lines.some((l) => re.test(l.text));
  } catch {
    return true; // OCR 故障 → 不拦
  }
}

/** 危险按 class 优先级取第一个「命中且 OCR 二次确认通过」的(降幻觉)。 */
async function firstConfirmedHazard(
  deps: EngineDeps,
  hazardIds: string[],
  hitMap: Map<string, Hit>,
): Promise<{ id: string; hit: Hit } | undefined> {
  const cands = hazardIds
    .filter((id) => hitMap.has(id))
    .sort((a, b) => HAZARD_ORDER[target(deps, a).hazardClass ?? "overlay"] - HAZARD_ORDER[target(deps, b).hazardClass ?? "overlay"]);
  for (const id of cands) {
    const hit = hitMap.get(id)!;
    if (await hazardConfirmed(deps, id, hit)) return { id, hit };
    deps.log?.(`危险(${id}) OCR 二次确认未过 → 判幻觉,跳过`);
  }
  return undefined;
}

// —— 手势 ——
function blindSwipeNext(deps: EngineDeps): Promise<void> {
  return deps.driver.swipe(normPx(0.5, 0.66, deps.size), normPx(0.5, 0.26, deps.size), 250);
}
function backGesture(deps: EngineDeps): Promise<void> {
  return deps.driver.swipe(normPx(0.02, 0.5, deps.size), normPx(0.78, 0.5, deps.size), 200);
}

async function handleHazard(deps: EngineDeps, id: string, hit: Hit): Promise<void> {
  const h = target(deps, id).handler ?? "tapBox";
  deps.log?.(`危险(${id}) → ${h}`);
  deps.onEvent?.("hazard_handled", { id, handler: h });
  switch (h) {
    case "deny":
    case "allow":
    case "tapBox":
      await deps.driver.tap(centerPx(hit.box, deps.size));
      break;
    case "swipeAway":
      await blindSwipeNext(deps);
      break;
    case "back":
      await backGesture(deps);
      break;
    case "skip":
      break; // 交插件动作层处理
  }
}

async function execAct(deps: EngineDeps, act: BasicOp, hitMap: Map<string, Hit>): Promise<void> {
  switch (act.kind) {
    case "none":
      return;
    case "tapTarget": {
      const hit = hitMap.get(act.target);
      if (!hit) throw new Error(`act 要点 ${act.target},但本帧未定位到`);
      await deps.driver.tap(centerPx(hit.box, deps.size));
      return;
    }
    case "tapPoint":
      await deps.driver.tap(act.point);
      return;
    case "typeInto": {
      const hit = hitMap.get(act.target);
      if (hit) await deps.driver.tap(centerPx(hit.box, deps.size)); // 有输入框先聚焦
      await deps.driver.typeText(act.text);
      return;
    }
    case "swipeNext":
      await blindSwipeNext(deps);
      return;
    case "swipe":
      await deps.driver.swipe(act.from, act.to, act.durMs ?? 250);
      return;
  }
}

/**
 * 轮询直到任一 verify 目标出现或到 deadline。空 verify = 纯动作步,直接成功。
 * **等待期间也处理危险**(如权限窗/弹窗在页面转换时弹出),否则会被挡死。
 */
async function awaitTargets(deps: EngineDeps, verifyIds: string[], hazardIds: string[], deadline: number): Promise<boolean> {
  if (verifyIds.length === 0) return true;
  const pollMs = deps.pollMs ?? POLL_MS;
  const queryIds = [...new Set([...verifyIds, ...hazardIds])];
  while (deps.now() < deadline) {
    if (deps.shouldStop()) return false;
    const hitMap = await locateTargets(deps, queryIds);
    const hz = await firstConfirmedHazard(deps, hazardIds, hitMap);
    if (hz) {
      await handleHazard(deps, hz.id, hz.hit); // 关掉弹窗后继续等 verify
      await deps.sleep(pollMs); // 让时钟前进 + 给 UI 更新时间(防危险短暂 persist 时忙循环)
      continue;
    }
    if (verifyIds.some((id) => hitMap.has(id))) return true;
    await deps.sleep(pollMs);
  }
  return false;
}

/**
 * 一次决策尝试(闭环轮询)。返回 ok/hazard/stopped/timeout。
 * 危险优先于期望;期望不在先当「加载中」轮询;超时才返回 timeout(升级交 runStep)。
 */
/** act 若要点/输入某目标,其 id 也必须被定位到才能执行(否则是盲点)。 */
function actTargetId(act?: Step["act"]): string | undefined {
  if (act && (act.kind === "tapTarget" || act.kind === "typeInto")) return act.target;
  return undefined;
}

export async function decide(step: Step, deps: EngineDeps): Promise<DecideOutcome> {
  if (deps.shouldStop()) return { status: "stopped" };
  const pollMs = deps.pollMs ?? POLL_MS;
  const deadline = deps.now() + step.timeout;
  const actId = actTargetId(step.act);
  const queryIds = [...new Set([...step.hazards, ...step.expected, ...(actId ? [actId] : [])])];

  while (deps.now() < deadline) {
    if (deps.shouldStop()) return { status: "stopped" };
    const hitMap = await locateTargets(deps, queryIds);

    // ① 危险优先(OCR 二次确认降幻觉)
    const hz = await firstConfirmedHazard(deps, step.hazards, hitMap);
    if (hz) {
      await handleHazard(deps, hz.id, hz.hit);
      return { status: "hazard", id: hz.id };
    }
    // ② 期望在 →(要点的目标也在)执行 act,再验证。要点的目标还没出现 = 加载中,继续轮询。
    const exp = step.expected.find((id) => hitMap.has(id));
    if (exp && (!actId || hitMap.has(actId))) {
      if (step.act && step.act.kind !== "none") await execAct(deps, step.act, hitMap);
      const ok = await awaitTargets(deps, step.verify, step.hazards, deadline);
      return ok ? { status: "ok" } : { status: "timeout" };
    }
    // ③ 期望不在 / 要点的目标未现 ≠ 失败:先当加载中,轮询
    await deps.sleep(pollMs);
  }
  // ④ 超时
  return { status: "timeout" };
}

export type StepResult =
  | { status: "ok" }
  | { status: "stopped" }
  | { status: "recover" } // 需上层回基地
  | { status: "alert"; message: string };

/**
 * 跑一步 + 升级策略。危险处理算「进展」→ 重跑本步(有熔断);超时按 onFail 链升级,
 * 终点永远是停手告警(不盲动,D6)。
 */
export async function runStep(step: Step, deps: EngineDeps): Promise<StepResult> {
  const chain: Escalation[] = step.onFail.length
    ? step.onFail
    : [{ kind: "alertOperator", message: `步骤失败: ${step.intent}` }];
  let hazardHandles = 0;
  let escIdx = 0;
  let retryLeft = 0;
  let variants: BasicOp[] | null = null;
  let variantIdx = 0;
  let cur: Step = step;

  while (true) {
    if (deps.shouldStop()) return { status: "stopped" };
    const o = await decide(cur, deps);

    if (o.status === "ok") return { status: "ok" };
    if (o.status === "stopped") return { status: "stopped" };
    if (o.status === "hazard") {
      if (++hazardHandles > MAX_HAZARD_HANDLES) {
        return { status: "alert", message: `同一步危险反复出现无法清除: ${step.intent}` };
      }
      // 处理了危险=进展,重跑本步、重置升级预算(整体仍受 hazardHandles 熔断)
      cur = step;
      escIdx = 0;
      retryLeft = 0;
      variants = null;
      continue;
    }

    // o.status === "timeout" → 升级
    if (retryLeft > 0) {
      retryLeft--;
      cur = step;
      continue;
    }
    if (variants && variantIdx < variants.length) {
      cur = { ...step, act: variants[variantIdx++] };
      continue;
    }
    if (escIdx >= chain.length) {
      return { status: "alert", message: `升级链耗尽: ${step.intent}` };
    }
    const esc = chain[escIdx++];
    switch (esc.kind) {
      case "retry":
        retryLeft = Math.max(0, esc.times);
        cur = step;
        break;
      case "variants":
        variants = esc.ops;
        variantIdx = 0;
        cur = variants.length ? { ...step, act: variants[variantIdx++] } : step;
        break;
      case "recover":
        return { status: "recover" };
      case "alertOperator":
        return { status: "alert", message: esc.message };
    }
  }
}

// 供插件动作层复用的低层封装(L1 的一部分)。
export async function tapTargetNow(deps: EngineDeps, id: string): Promise<Point | null> {
  const hitMap = await locateTargets(deps, [id]);
  const hit = hitMap.get(id);
  if (!hit) return null;
  const p = centerPx(hit.box, deps.size);
  await deps.driver.tap(p);
  return p;
}
