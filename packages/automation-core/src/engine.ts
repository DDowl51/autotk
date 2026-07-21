// 决策引擎(core,与 app 无关)。每步:观测 → 组合定位 → 危险优先 → 期望执行 → 验证/轮询 → 超时升级。
// 公理 A1–A4 的直接落地。全部依赖经 EngineDeps 注入,便于 mock 截图序列离线单测。
import { centerPx, normPx, type Point, type Size } from "./geometry";
import type { Driver, Hit, LocateQuery, Perceptor, TextLine } from "./interfaces";
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
 * 危险优先·**一次检测**(2026-07-21,为多机吞吐重构)。为什么不逐个 grounding 查危险:
 * LocateAnything 单目标 → N 个危险 = N 次定位;且模型对不存在目标幻觉出框,还得逐个 OCR 复核 →
 * 每轮十几次 VLM,几百台跑不动。改法:**读一次屏上文字**,用各危险的 `ocr` 特征在全屏文本里匹配 ——
 * 命中即该危险在场(其标志文字真的在屏上,不靠 grounding 幻觉,天然过滤假阳)。干净页 0 次额外定位;
 * 真有弹窗才对命中的那个 grounding 取关闭键坐标(点按类),手势类(swipeAway/back/skip)连定位都免。
 * 每轮成本:干净页=1 次 OCR;有危险=1 OCR+1 定位。危险优先与全部覆盖都不变。
 * 无 `ocr` 特征的危险(图标类无文字可匹配)→ 退回**逐个 grounding 检测**(信 VLM);
 * 故凡进「页级危险」的都应带 `ocr`(内容类标记如直播/广告不进此网,交工作流逻辑判,免字幕误伤)。
 */
async function detectHazard(deps: EngineDeps, hazardIds: string[]): Promise<{ id: string; hit: Hit } | undefined> {
  if (hazardIds.length === 0) return undefined;
  const sorted = [...hazardIds].sort(
    (a, b) => HAZARD_ORDER[target(deps, a).hazardClass ?? "overlay"] - HAZARD_ORDER[target(deps, b).hazardClass ?? "overlay"],
  );
  let lines: TextLine[] | null = null; // 懒读:有 ocr 危险时才读一次屏,后续 ocr 危险共用
  for (const id of sorted) {
    const t = target(deps, id);
    if (!t.ocr) {
      // 无 ocr 特征 → grounding 检测(图标类无文字;信 VLM)。
      const h = (await locateTargets(deps, [id])).get(id);
      if (h) return { id, hit: h };
      continue;
    }
    let re: RegExp;
    try {
      re = new RegExp(t.ocr, "i");
    } catch {
      continue; // 正则坏 → 跳过该危险
    }
    if (lines === null) {
      try {
        lines = await deps.perceptor.readText(await deps.driver.screenshot());
      } catch {
        lines = []; // OCR 故障 → 本轮当作无 ocr 危险命中(宁可漏，不盲动)
      }
    }
    const line = lines.find((l) => re.test(l.text));
    if (!line) continue;
    // 命中危险特征文字。点按类(deny/allow/tapBox)再 grounding 取关闭键坐标(定不到就退用匹配行框);
    // 手势类(swipeAway/back/skip)不需坐标,用匹配行框占位(handleHazard 不读它)。
    const handler = t.handler ?? "tapBox";
    if (handler === "deny" || handler === "allow" || handler === "tapBox") {
      const h = (await locateTargets(deps, [id])).get(id);
      return { id, hit: h ?? { id, box: line.box, score: 1 } };
    }
    return { id, hit: { id, box: line.box, score: 1 } };
  }
  return undefined;
}

/**
 * 单目标观测。**危险优先(公理)**:先一次检测危险(detectHazard),命中即先处理——弹窗/权限窗
 * 很可能挡住或干扰正常操作,必须先清干净再动目标(处理完一个即返回,由 runStep 重跑本步,逐个清完,
 * 受 MAX_HAZARD_HANDLES 熔断)。无危险后,才按序**单查** wantIds(要点/期望;组合查询模型只回第一个),命中即返回。
 */
async function observeStep(
  deps: EngineDeps,
  wantIds: string[],
  hazardIds: string[],
): Promise<{ hit?: { id: string; hit: Hit }; hazard?: { id: string; hit: Hit } }> {
  const hz = await detectHazard(deps, hazardIds);
  if (hz) return { hazard: hz };
  for (const id of wantIds) {
    const h = (await locateTargets(deps, [id])).get(id);
    if (h) return { hit: { id, hit: h } };
  }
  return {};
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
  while (deps.now() < deadline) {
    if (deps.shouldStop()) return false;
    const obs = await observeStep(deps, verifyIds, hazardIds);
    if (obs.hazard) {
      await handleHazard(deps, obs.hazard.id, obs.hazard.hit); // 关掉弹窗后继续等 verify
      await deps.sleep(pollMs); // 让时钟前进 + 给 UI 更新时间(防危险短暂 persist 时忙循环)
      continue;
    }
    if (obs.hit) return true; // 任一 verify 命中
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
  // 要找的目标:要点目标(要执行的)优先,其次期望(证明在对的页)。单查,命中即够。
  const wantIds = actId ? [actId, ...step.expected] : step.expected;

  while (deps.now() < deadline) {
    if (deps.shouldStop()) return { status: "stopped" };
    const obs = await observeStep(deps, wantIds, step.hazards);
    deps.log?.(`👁 观测 → ${obs.hazard ? "危险 " + obs.hazard.id : obs.hit ? "命中 " + obs.hit.id : "无"}`);

    // ① 危险优先:observeStep 先扫危险,命中即先处理(清完再动目标)
    if (obs.hazard) {
      await handleHazard(deps, obs.hazard.id, obs.hazard.hit);
      return { status: "hazard", id: obs.hazard.id };
    }
    // ② 找到目标:act 步须找到「要点目标」才点(找到的是期望=页对但按钮未现,继续轮询等要点)
    if (obs.hit && (!actId || obs.hit.id === actId)) {
      if (step.act && step.act.kind !== "none") await execAct(deps, step.act, new Map([[obs.hit.id, obs.hit.hit]]));
      const ok = await awaitTargets(deps, step.verify, step.hazards, deadline);
      return ok ? { status: "ok" } : { status: "timeout" };
    }
    // ③ 还没好 → 轮询
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

  deps.log?.(`▶ ${step.intent}`); // 步骤意图:真机看当前在做哪一步

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
