import type { ModuleInteractionParams } from "../../params/types";
import type { CommentGenerator, RunContext } from "../types";
import type { TikTokUI, VideoInfo } from "../tiktok-ui";
import { chance, jitter } from "../random";

/**
 * 对「当前正在播放的视频」执行一次完整互动：视频级动作 + 评论区互动。
 * 三个模块（推荐页/搜索页/个人主页）共用此逻辑，差异仅在传入的参数。
 */
export async function interactWithVideo(
  ctx: RunContext,
  ui: TikTokUI,
  gen: CommentGenerator,
  mp: ModuleInteractionParams,
  video: VideoInfo,
): Promise<void> {
  const { stats, params } = ctx;

  // —— 视频级：点赞 / 收藏 / 关注 ——
  if (chance(mp.videoLikeProb)) {
    await ui.likeVideo();
    stats.likes++;
  }
  if (chance(mp.videoSaveProb)) {
    await ui.saveVideo();
    stats.saves++;
  }
  if (chance(mp.videoFollowProb)) {
    await ui.followAuthor();
    stats.follows++;
  }

  // —— 评论区互动 ——
  if (!mp.interactEnable || !chance(mp.interactProb)) return;

  await ui.openComments();
  try {
    const comments = await ui.listComments();

    let liked = 0;
    let replied = 0;
    for (const c of comments) {
      if (ctx.shouldStop()) break;

      if (liked < mp.commentLikeMaxCount && chance(mp.commentLikeProb)) {
        await ui.likeComment(c);
        stats.commentLikes++;
        liked++;
        await ctx.sleep(jitter(params.clickWaitTime));
      }

      if (replied < mp.commentReplyMaxCount && chance(mp.commentReplyProb)) {
        const text = await gen.reply({
          videoCaption: video.caption,
          targetComment: c.text,
          language: params.language,
        });
        await ui.replyComment(c, text);
        stats.commentReplies++;
        replied++;
        await ctx.sleep(jitter(params.clickWaitTime));
      }

      if (liked >= mp.commentLikeMaxCount && replied >= mp.commentReplyMaxCount) {
        break;
      }
    }
  } finally {
    await ui.closeComments();
  }
}

/** 视频文案/标签是否命中给定提示词（全部小写匹配）。"*" 表示匹配所有。 */
export function matchesPrompts(video: VideoInfo, prompts: string[]): boolean {
  if (prompts.length === 0) return false;
  if (prompts.includes("*")) return true;
  const hay = (video.caption + " " + video.tags.join(" ")).toLowerCase();
  return prompts.some((p) => hay.includes(p.toLowerCase()));
}
