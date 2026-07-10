// 主页互动 + 私信(同一趟):进我自己主页 → 每条作品评论区 → 评论互动 + 挑人私信。
// 语义见 docs/specs/L3-业务规格.md §6.3/§6.5。每天一次触发由编排器控制。
import type { RunContext, Step } from "@auto/core";
import type { TikTokParams } from "../params";
import { matchComment } from "../comments";
import { interactComments, scrollComments } from "./comments";
import { dmCommenter } from "./dm";

function step(intent: string, act: Step["act"], expected: string[], verify: string[], hazards: string[]): Step {
  return { intent, act, expected, hazards, verify, timeout: 10000, onFail: [{ kind: "retry", times: 1 }, { kind: "recover" }, { kind: "alertOperator", message: `主页步失败: ${intent}` }] };
}

/** 当前登录账号标识(去重按它分账号)。运行时由编排器注入到 params 或 session;这里从 params 取,缺省 "self"。 */
function accountOf(p: TikTokParams): string {
  return (p as unknown as { account?: string }).account ?? "self";
}

export async function profileAndDM(ctx: RunContext, profileHazards: string[], feedHazards: string[]): Promise<void> {
  const p = ctx.params as TikTokParams;
  const mp = p.persHome;
  if (!mp.moduleEnable) {
    ctx.log("[主页] 未开启,跳过");
    return;
  }
  const account = accountOf(p);
  const dmOn = p.dm.dmEnable && p.dm.dmKeywords.length > 0 && p.dm.dmTemplates.length > 0;

  // 进我的主页
  if ((await ctx.runStep(step("进个人主页", { kind: "tapTarget", target: "profile.tab" }, ["feed.rail"], ["profile.grid"], feedHazards))).status !== "ok") return;

  for (let i = 0; i < mp.maxVideoCount; i++) {
    if (ctx.shouldStop() || !ctx.withinWindow()) break;
    // 打开第 i 条作品(第一条点网格首格;其后靠上滑切,简化为再点网格——真机可调)
    const open = i === 0 ? step("开首个作品", { kind: "tapTarget", target: "profile.grid-first" }, ["profile.grid"], ["feed.rail"], profileHazards) : step("下一条作品", { kind: "swipeNext" }, ["feed.rail"], ["feed.rail"], feedHazards);
    if ((await ctx.runStep(open)).status !== "ok") break;
    ctx.stats.videosWatched++;

    // 开评论区
    if ((await ctx.runStep(step("开评论区", { kind: "tapTarget", target: "feed.comment" }, ["feed.rail"], ["comments.panel"], feedHazards))).status !== "ok") continue;
    const comments = await scrollComments(ctx);

    // 评论互动(点赞/回复)
    await interactComments(ctx, mp, comments, {
      matchKeywords: p.commentMatchKeywords,
      replyTemplates: p.fixedReplies,
      postReplies: p.postReplies,
      clickWaitTime: p.clickWaitTime,
    });

    // 🆕 私信:命中 DM 关键词的评论者(去重+限量在 dmCommenter 内)
    if (dmOn) {
      for (const c of comments) {
        if (ctx.shouldStop()) break;
        if (c.isAd) continue;
        if (!matchComment(c.text, p.dm.dmKeywords)) continue;
        const r = await dmCommenter(ctx, c, account, p.dm);
        ctx.log(`私信 @${c.author}: ${r}`);
        if (r === "capped") break; // 到每日上限,本趟不再发
        await ctx.sleepSeconds(ctx.jitter(p.clickWaitTime));
      }
    }

    // 关评论区(下滑关,不左滑)
    await ctx.runStep(step("关评论区", { kind: "swipe", from: { x: ctx.size.width * 0.5, y: ctx.size.height * 0.35 }, to: { x: ctx.size.width * 0.5, y: ctx.size.height * 0.96 } }, ["comments.panel"], ["feed.rail"], []));
  }
  ctx.log("[主页] 结束");
}
