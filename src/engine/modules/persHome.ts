import type { CommentGenerator, RunContext } from "../types";
import type { TikTokUI } from "../tiktok-ui";
import { jitter } from "../random";
import { interactWithVideo } from "./common";

/**
 * 个人主页互动模块：对自己的作品评论区互动，激发用户二次回访。
 * 每天仅运行一次，由编排器触发。账号无作品时不应调用（moduleEnable=false）。
 */
export async function runPersHome(
  ctx: RunContext,
  ui: TikTokUI,
  gen: CommentGenerator,
): Promise<void> {
  const { params, logger } = ctx;
  const mp = params.persHome;

  if (!mp.moduleEnable) {
    logger.log("info", "[个人主页] 模块未开启，跳过");
    return;
  }

  logger.log("info", "[个人主页] 开始");
  await ui.openOwnProfile();

  const available = await ui.listOwnVideos();
  const count = Math.min(available, mp.maxVideoCount);
  for (let i = 0; i < count; i++) {
    if (ctx.shouldStop()) break;
    if (!ctx.withinWindow()) {
      logger.log("info", "[个人主页] 已到时间段边界，结束本批");
      break;
    }

    await ui.openOwnVideo(i);
    const video = await ui.readCurrentVideo();
    // 自己的作品不点赞/收藏/关注，只做评论区互动。
    await interactWithVideo(ctx, ui, gen, mp, video);

    await ctx.sleep(jitter(2));
    await ui.back();
  }

  logger.log("info", `[个人主页] 结束，互动 ${count} 条作品`);
}
