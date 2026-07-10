// 关注监控 / 打粉:切到「关注」流 → 逐条视频进评论区打粉回复。到底检测靠文案连续相同。
// 语义见 docs/specs/L3-业务规格.md §6.4。开启即纯打粉,与养号互斥(编排器保证)。
import type { RunContext, Step } from "@auto/core";
import type { TikTokParams } from "../params";
import { interactComments, scrollComments } from "./comments";

// 文案区(左下带,避开评论区/输入栏)。
const CAPTION_REGION: readonly [number, number, number, number] = [0, 0.72, 0.72, 0.88];

function step(intent: string, act: Step["act"], expected: string[], verify: string[], hazards: string[]): Step {
  return { intent, act, expected, hazards, verify, timeout: 10000, onFail: [{ kind: "retry", times: 1 }, { kind: "recover" }, { kind: "alertOperator", message: `关注流步失败: ${intent}` }] };
}

/** 读当前视频文案(拼行)。OCR 未接则空串。 */
async function readCaption(ctx: RunContext): Promise<string> {
  return (await ctx.readText(CAPTION_REGION)).join(" ").replace(/\s+/g, " ").trim();
}

export async function followMonitor(ctx: RunContext, feedHazards: string[], maxVideos = 5): Promise<void> {
  const p = ctx.params as TikTokParams;
  const mp = p.following;
  if (!mp.moduleEnable) {
    ctx.log("[关注监控] 未开启,跳过");
    return;
  }
  // 覆盖:词/话术留空则沿用全局
  const matchKeywords = mp.commentMatchKeywords.length ? mp.commentMatchKeywords : p.commentMatchKeywords;
  const replyTemplates = mp.fixedReplies.length ? mp.fixedReplies : p.fixedReplies;

  // 切「关注」流
  if ((await ctx.runStep(step("切关注流", { kind: "tapTarget", target: "nav.following-tab" }, ["nav.following-tab"], ["feed.rail"], feedHazards))).status !== "ok") return;

  let prevCap = "";
  for (let i = 0; i < maxVideos; i++) {
    if (ctx.shouldStop() || !ctx.withinWindow()) break;
    const cap = await readCaption(ctx);
    if (cap && cap === prevCap) {
      ctx.log("[关注监控] 文案连续相同,疑似到底,结束");
      break; // 滑不动=到底
    }
    prevCap = cap;

    // 直播卡:不打粉,盲滑跳过
    if ((await ctx.locate(["feed.live-tag"])).has("feed.live-tag")) {
      await ctx.runStep(step("跳过直播", { kind: "swipeNext" }, ["feed.rail"], ["feed.rail"], feedHazards));
      continue;
    }
    ctx.stats.videosWatched++;

    // 进评论区打粉(interactProb=1、命中词优先回复 0.8)
    if ((await ctx.runStep(step("开评论区", { kind: "tapTarget", target: "feed.comment" }, ["feed.rail"], ["comments.panel"], feedHazards))).status === "ok") {
      const comments = await scrollComments(ctx);
      await interactComments(ctx, mp, comments, { matchKeywords, replyTemplates, postReplies: p.postReplies, clickWaitTime: p.clickWaitTime });
      await ctx.runStep(step("关评论区", { kind: "swipe", from: { x: ctx.size.width * 0.5, y: ctx.size.height * 0.35 }, to: { x: ctx.size.width * 0.5, y: ctx.size.height * 0.96 } }, ["comments.panel"], ["feed.rail"], []));
    }

    if (i < maxVideos - 1) {
      if ((await ctx.runStep(step("下一条", { kind: "swipeNext" }, ["feed.rail"], ["feed.rail"], feedHazards))).status !== "ok") break;
    }
  }
  // 切回推荐流
  await ctx.runStep(step("切回推荐流", { kind: "tapTarget", target: "nav.foryou-tab" }, ["nav.foryou-tab"], ["feed.rail"], feedHazards));
  ctx.log("[关注监控] 结束");
}
