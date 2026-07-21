// 搜索工作流:点放大镜 → 输入关键词 → 提交 → 点第二个结果(跳广告位)→ 遍历结果视频互动。
// 语义见 docs/specs/L3-业务规格.md §6.2。导航步用 Step 合同(verify 轮询替代死 sleep)。
import type { RunContext, Step } from "@auto/core";
import type { TikTokParams } from "../params";
import { pageHazards } from "../targets";
import { captionAllowsFollow, captionGateNeeded, interactWithVideo, readCaption } from "./common";
import { interactComments, scrollComments } from "./comments";

const SEARCH_HZ = pageHazards("search");
const FEED_HZ = pageHazards("feed");

/** 建一个「点某目标」的导航步。 */
function tapStep(intent: string, target: string, expected: string[], verify: string[], hazards: string[]): Step {
  return {
    intent,
    act: { kind: "tapTarget", target },
    expected,
    hazards,
    verify,
    timeout: 12000, // 搜索结果加载慢,给足
    onFail: [{ kind: "retry", times: 1 }, { kind: "recover" }, { kind: "alertOperator", message: `搜索步失败: ${intent}` }],
  };
}

/** 盲滑到下一个结果视频的步(前置危险检测由 hazards 完成)。 */
function nextStep(hazards: string[]): Step {
  return {
    intent: "下一个结果",
    act: { kind: "swipeNext" },
    expected: ["feed.rail"],
    hazards,
    verify: ["feed.rail"],
    timeout: 8000,
    onFail: [{ kind: "recover" }, { kind: "alertOperator", message: "切下一个结果失败" }],
  };
}

export async function searchWorkflow(ctx: RunContext, maxResults = 5): Promise<void> {
  const p = ctx.params as TikTokParams;
  const mp = p.kwSearch;
  const kw = ctx.pick(p.searchKeywords);
  if (!kw) {
    ctx.log("[搜索页] 无搜索关键词,跳过");
    return;
  }
  ctx.log(`[搜索页] 搜索「${kw}」`);

  // 1) 点放大镜 → 出现搜索输入框
  if ((await ctx.runStep(tapStep("点放大镜", "nav.search-icon", ["feed.rail"], ["search.input"], FEED_HZ))).status !== "ok") return;
  // 2) 输入关键词 → 出现提交按钮
  const typeStep: Step = {
    intent: "输入关键词",
    act: { kind: "typeInto", target: "search.input", text: kw },
    expected: ["search.input"],
    hazards: SEARCH_HZ,
    verify: ["search.submit"],
    timeout: 8000,
    onFail: [{ kind: "retry", times: 1 }, { kind: "alertOperator", message: "输入关键词失败" }],
  };
  if ((await ctx.runStep(typeStep)).status !== "ok") return;
  // 3) 提交搜索(点提交键;不立即验结果——结果加载慢,靠下面「固定等待 + 下滑 + 找 search.results」确认)
  const submitStep: Step = {
    intent: "提交搜索",
    act: { kind: "tapTarget", target: "search.submit" },
    expected: ["search.submit"],
    hazards: SEARCH_HZ,
    verify: [], // 纯动作:点了就算
    timeout: 8000,
    onFail: [{ kind: "retry", times: 1 }, { kind: "alertOperator", message: "点提交失败" }],
  };
  if ((await ctx.runStep(submitStep)).status !== "ok") return;
  // 结果加载慢:固定等 5s,再往下翻一屏(手指上滑 to.y<from.y,内容上移、露出下面的结果),然后才找 search.results。
  await ctx.sleepSeconds(5);
  const { width: sw, height: sh } = ctx.size;
  await ctx.swipe({ x: sw * 0.5, y: sh * 0.7 }, { x: sw * 0.5, y: sh * 0.38 }, 300);
  await ctx.sleepSeconds(ctx.jitter(1));
  const resultsStep: Step = {
    intent: "等结果列表",
    expected: ["search.results"],
    hazards: SEARCH_HZ,
    verify: ["search.results"],
    timeout: 10000,
    onFail: [{ kind: "retry", times: 1 }, { kind: "recover" }, { kind: "alertOperator", message: "搜索结果未出现" }],
  };
  if ((await ctx.runStep(resultsStep)).status !== "ok") return;
  // 4) 选结果:优先「首个非广告非直播」,VLM 找不到则退回点第二个(跳广告位)
  const cand = await ctx.locate(["search.first-clean-result", "search.result-2"]);
  const resultTarget = cand.has("search.first-clean-result") ? "search.first-clean-result" : "search.result-2";
  ctx.log(`[搜索页] 选结果:${resultTarget}`);
  if ((await ctx.runStep(tapStep("开结果视频", resultTarget, ["search.results"], ["feed.rail"], SEARCH_HZ))).status !== "ok") return;

  // 5) 遍历结果视频互动
  for (let i = 0; i < maxResults; i++) {
    if (ctx.shouldStop() || !ctx.withinWindow()) break;
    // 进流兼验:即使结果页选错,这里再判一道直播/广告 → 命中则划走不互动(双保险)
    const bad = await ctx.locate(["feed.live-tag", "feed.ad-marker"]);
    if (bad.size > 0) {
      ctx.log(`结果视频是${bad.has("feed.live-tag") ? "直播" : "广告"},划走不互动`);
    } else {
      ctx.stats.videosWatched++;
      // 关注按文案命中 gate(posPrompts/negPrompts;默认 ["*"]=match-all → 纯概率)。只在需要时读文案。
      let canFollow = true;
      if (captionGateNeeded(p.posPrompts, p.negPrompts)) {
        const cap = await readCaption(ctx);
        canFollow = captionAllowsFollow(cap, p.posPrompts, p.negPrompts);
        ctx.log(`文案${canFollow ? "命中" : "未命中"}关注词`);
      }
      await interactWithVideo(ctx, mp, { canFollow });
      // 评论区互动(门槛 interactEnable && interactProb;有评论按钮才进)
      if (mp.interactEnable && ctx.chance(mp.interactProb) && (await ctx.locate(["feed.comment"])).has("feed.comment")) {
        await interactCommentsOnResult(ctx, p, mp);
      }
      await ctx.sleepSeconds(ctx.jitter(2));
    }
    if (i < maxResults - 1) {
      if ((await ctx.runStep(nextStep(FEED_HZ))).status !== "ok") break;
    }
  }
  // 搜索结束时人在结果视频页、深在栈里:连续右滑返回(视频→结果→搜索→推荐流),最多 3 次;
  // 每次先看是否已回流(feed.rail),回到即停——避免在推荐流上多滑触发误导航。回不去交下个工作流的 recover。
  const { width: bw, height: bh } = ctx.size;
  for (let b = 0; b < 3; b++) {
    if (ctx.shouldStop()) break;
    if ((await ctx.locate(["feed.rail"])).has("feed.rail")) break;
    ctx.log(`[搜索页] 返回推荐流(第 ${b + 1}/3 次右滑)`);
    await ctx.swipe({ x: 0.02 * bw, y: 0.5 * bh }, { x: 0.78 * bw, y: 0.5 * bh }, 200);
    await ctx.sleepSeconds(ctx.jitter(1));
  }
  ctx.log("[搜索页] 结束");
}

/** 在当前结果视频进评论区:开→下滑收集→逐条点赞/回复→关。开不了就跳过,不挡主流程。 */
async function interactCommentsOnResult(ctx: RunContext, p: TikTokParams, mp: TikTokParams["kwSearch"]): Promise<void> {
  const open: Step = {
    intent: "开评论区",
    act: { kind: "tapTarget", target: "feed.comment" },
    expected: ["feed.rail"],
    hazards: FEED_HZ,
    verify: ["comments.panel"],
    timeout: 8000,
    onFail: [{ kind: "retry", times: 1 }, { kind: "alertOperator", message: "开评论区失败" }],
  };
  if ((await ctx.runStep(open)).status !== "ok") return;
  const comments = await scrollComments(ctx);
  await interactComments(ctx, mp, comments, {
    matchKeywords: p.commentMatchKeywords,
    replyTemplates: p.fixedReplies,
    postReplies: p.postReplies,
    clickWaitTime: p.clickWaitTime,
  });
  // 关评论区:纯竖直下滑(不左滑)。
  await ctx.swipe({ x: ctx.size.width * 0.5, y: ctx.size.height * 0.35 }, { x: ctx.size.width * 0.5, y: ctx.size.height * 0.96 }, 250);
}
