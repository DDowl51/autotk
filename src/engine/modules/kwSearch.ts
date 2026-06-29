import type { CommentGenerator, RunContext } from "../types";
import type { TikTokUI } from "../tiktok-ui";
import { jitter, pick } from "../random";
import { interactWithVideo } from "./common";

/**
 * 关键词搜索互动模块：营销主阵地，针对对标视频拉精准用户。
 * 从关键词中随机挑一个搜索，遍历结果视频进行互动。
 *
 * @param maxResults 本轮最多互动的搜索结果数。
 */
export async function runKwSearch(
  ctx: RunContext,
  ui: TikTokUI,
  gen: CommentGenerator,
  maxResults: number,
): Promise<void> {
  const { params, stats, logger } = ctx;
  const mp = params.kwSearch;

  const keyword = pick(params.searchKeywords);
  if (!keyword) {
    logger.log("warn", "[搜索页] 无搜索关键词，跳过");
    return;
  }

  logger.log("info", `[搜索页] 搜索「${keyword}」，计划互动 ${maxResults} 条`);
  await ui.search(keyword);

  const total = Math.min(await ui.countSearchResults(), maxResults);
  for (let i = 0; i < total; i++) {
    if (ctx.shouldStop()) break;
    if (!ctx.withinWindow()) {
      logger.log("info", "[搜索页] 已到时间段边界，结束本批");
      break;
    }
    if (ui.recoverIfLost) await ui.recoverIfLost(); // 误点跳走/应用内浮层 → 自动脱困
    if (await ui.detectPopup()) {
      logger.log("warn", "[搜索页] 浮层未能自动关闭，结束本轮");
      break;
    }

    await ui.openSearchResult(i);
    const video = await ui.readCurrentVideo();
    stats.videosWatched++;

    // 搜索结果默认都是对标视频，无需提示词过滤，直接互动。
    await interactWithVideo(ctx, ui, gen, mp, video);

    await ctx.sleep(jitter(2));
    await ui.back();
  }

  // 退出搜索结果流，返回推荐流（否则下一轮推荐页会在搜索流里养号）。
  if (ui.returnToFeed) await ui.returnToFeed();
  logger.log("info", "[搜索页] 结束");
}
