// 视频级互动(G3:点赞/收藏/关注;评论区互动 + DM 在 G4)。三概率独立判定。
import type { RunContext } from "@auto/core";
import type { ModuleParams, TikTokParams } from "../params";

export async function interactWithVideo(ctx: RunContext, mp: ModuleParams): Promise<void> {
  if (ctx.shouldStop()) return;
  const p = ctx.params as TikTokParams;
  const wait = () => ctx.sleepSeconds(ctx.jitter(p.clickWaitTime));

  if (ctx.chance(mp.videoLikeProb)) {
    if (await ctx.tapTarget("feed.like")) {
      ctx.stats.likes++;
      ctx.log("已点赞");
    }
    await wait();
  }
  if (ctx.chance(mp.videoSaveProb)) {
    if (await ctx.tapTarget("feed.save")) {
      ctx.stats.saves++;
      ctx.log("已收藏");
    }
    await wait();
  }
  if (ctx.chance(mp.videoFollowProb)) {
    // 关注键:已关注则无(tapTarget 返回 false)→ 跳过,不计数。
    if (await ctx.tapTarget("feed.follow")) {
      ctx.stats.follows++;
      ctx.log("已关注作者");
    }
    await wait();
  }
}
