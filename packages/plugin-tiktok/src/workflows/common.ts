// 视频级互动(点赞/收藏/关注)+ 文案读取/关注 gate 助手。三概率独立判定。
import type { RunContext } from "@auto/core";
import { matchComment } from "../comments";
import type { ModuleParams, TikTokParams } from "../params";

// 文案区(左下带,避开评论区/输入栏)。search / following 共用。
export const CAPTION_REGION: readonly [number, number, number, number] = [0, 0.72, 0.72, 0.88];

/** 读当前视频文案(拼行)。OCR 未接则空串。 */
export async function readCaption(ctx: RunContext): Promise<string> {
  return (await ctx.readText(CAPTION_REGION)).join(" ").replace(/\s+/g, " ").trim();
}

/** 是否需要读文案来 gate 关注(有排除词、或有非 `*` 的正词);否则省一次 OCR。 */
export function captionGateNeeded(pos: string[], neg: string[]): boolean {
  return neg.length > 0 || (pos.length > 0 && !pos.includes("*"));
}

/** 文案是否允许关注:命中排除词→否;无正词或含 `*`(match-all)→是;否则须命中正词。 */
export function captionAllowsFollow(caption: string, pos: string[], neg: string[]): boolean {
  if (neg.length > 0 && matchComment(caption, neg) !== null) return false;
  if (pos.length === 0 || pos.includes("*")) return true;
  return matchComment(caption, pos) !== null;
}

/** opts.canFollow=false 时跳过关注(搜索按文案命中 gate 用);缺省 true 不影响其它调用方。 */
export async function interactWithVideo(ctx: RunContext, mp: ModuleParams, opts?: { canFollow?: boolean }): Promise<void> {
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
  if (opts?.canFollow !== false && ctx.chance(mp.videoFollowProb)) {
    // 关注键:已关注则无(tapTarget 返回 false)→ 跳过,不计数。canFollow=false(文案未命中)则整块跳过。
    if (await ctx.tapTarget("feed.follow")) {
      ctx.stats.follows++;
      ctx.log("已关注作者");
    }
    await wait();
  }
}
