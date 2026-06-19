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
    if (await ui.detectPopup()) {
      logger.log("warn", "[搜索页] 检测到弹窗，等待人工干预");
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

  logger.log("info", "[搜索页] 结束");
}
