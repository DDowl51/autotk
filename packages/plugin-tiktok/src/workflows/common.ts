// 视频级互动(G3:点赞/收藏/关注;评论区互动 + DM 在 G4)。三概率独立判定。
import type { RunContext } from "@auto/core";
import type { ModuleParams, TikTokParams } from "../params";

export async function interactWithVideo(ctx: RunContext, mp: ModuleParams): Promise<void> {
  if (ctx.shouldStop()) return;
  const p = ctx.params as TikTokParams;
  const wait = () => ctx.sleepSeconds(ctx.jitter(p.clickWaitTime));

  if (ctx.chance(mp.videoLikeProb)) {
    // 只点「白色未点赞」的心;已点赞(红心)则 feed.like-off 缺席→不点,避免再点=取消赞。
    if (await ctx.tapTarget("feed.like-off")) {
      ctx.stats.likes++;
      ctx.log("已点赞");
    } else {
      ctx.log("已点赞过,跳过");
    }
    await wait();
  }
  if (ctx.chance(mp.videoSaveProb)) {
    // 同理:只收藏「白色未收藏」的书签;已收藏(黄色)则缺席→跳过。
    if (await ctx.tapTarget("feed.save-off")) {
      ctx.stats.saves++;
      ctx.log("已收藏");
    } else {
      ctx.log("已收藏过,跳过");
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
