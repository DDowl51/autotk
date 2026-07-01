import type { CommentGenerator, RunContext } from "../types";
import type { TikTokUI } from "../tiktok-ui";
import { jitter } from "../random";
import { createFixedReplyGenerator } from "../../gen";
import { interactWithVideo } from "./common";

/**
 * 关注监控（打粉）模块：切到「关注」流，逐条查看你关注的账号发的视频，
 * 进评论区、对命中打粉关键词的评论回复引流话术。
 *
 * 与养号模块的差异：
 * - 不按 pos/neg 提示词筛视频（关注的账号本就是目标，逐条都看）；
 * - 关键词/话术支持「模块覆盖」：following 自带则用自带，留空则沿用全局；
 * - 视频点赞/收藏/关注默认关（打粉聚焦评论回复），由 following 参数控制。
 *
 * @param maxVideos 本轮最多查看的关注视频数（由编排器给出）。
 */
export async function runFollowingFeed(
  ctx: RunContext,
  ui: TikTokUI,
  gen: CommentGenerator,
  maxVideos: number,
): Promise<void> {
  const { params, stats, logger } = ctx;
  const mp = params.following;

  // 「全局默认 + 可覆盖」：following 配了自己的词/话术就用它，否则用全局那套。
  const matchKeywords =
    mp.commentMatchKeywords && mp.commentMatchKeywords.length > 0
      ? mp.commentMatchKeywords
      : params.commentMatchKeywords;
  const replyGen =
    mp.fixedReplies && mp.fixedReplies.length > 0 ? createFixedReplyGenerator(mp.fixedReplies) : gen;

  logger.log("info", `[关注监控] 开始，计划查看 ${maxVideos} 条关注视频`);
  await ui.openFollowingFeed();

  for (let i = 0; i < maxVideos; i++) {
    if (ctx.shouldStop()) break;
    if (!ctx.withinWindow()) {
      logger.log("info", "[关注监控] 已到时间段边界，结束本批");
      break;
    }
    if (ui.recoverIfLost) await ui.recoverIfLost();
    if (await ui.detectPopup()) {
      logger.log("warn", "[关注监控] 浮层未能自动关闭，结束本轮");
      break;
    }

    const video = await ui.readCurrentVideo();
    stats.videosWatched++;

    // 逐条关注视频都进评论区匹配回复（视频级动作由 following 参数控制，默认全关）。
    await interactWithVideo(ctx, ui, replyGen, mp, video, matchKeywords);

    await ctx.sleep(jitter(3));
    await ui.swipeToNextVideo();
  }

  logger.log("info", "[关注监控] 结束");
}
