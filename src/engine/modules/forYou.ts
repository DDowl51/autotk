import type { CommentGenerator, RunContext } from "../types";
import type { TikTokUI } from "../tiktok-ui";
import { jitter } from "../random";
import { interactWithVideo, matchesPrompts } from "./common";

/**
 * 推荐页互动模块：巩固兴趣标签、提高账号活性。
 * 浏览推荐流，命中正向提示词的视频才互动，命中反向提示词的立即划走。
 *
 * @param maxVideos 本轮最多浏览的视频数（由编排器按时间预算给出）。
 */
export async function runForYou(
  ctx: RunContext,
  ui: TikTokUI,
  gen: CommentGenerator,
  maxVideos: number,
): Promise<void> {
  const { params, stats, logger } = ctx;
  const mp = params.forYou;

  logger.log("info", `[推荐页] 开始，计划浏览 ${maxVideos} 条`);
  await ui.openForYou();

  for (let i = 0; i < maxVideos; i++) {
    if (ctx.shouldStop()) break;
    if (await ui.detectPopup()) {
      logger.log("warn", "[推荐页] 检测到弹窗，等待人工干预");
      break;
    }

    const video = await ui.readCurrentVideo();
    stats.videosWatched++;

    if (matchesPrompts(video, params.negPrompts)) {
      // 命中反向提示词：立即划走。
      await ui.swipeToNextVideo();
      continue;
    }

    if (matchesPrompts(video, params.posPrompts)) {
      await interactWithVideo(ctx, ui, gen, mp, video);
    }

    // 模拟观看时长后切下一个。
    await ctx.sleep(jitter(3));
    await ui.swipeToNextVideo();
  }

  logger.log("info", `[推荐页] 结束，已浏览 ${stats.videosWatched} 条`);
}
