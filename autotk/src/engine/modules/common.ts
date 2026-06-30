import type { ModuleInteractionParams } from "../../params/types";
import type { CommentGenerator, RunContext } from "../types";
import type { TikTokUI, VideoInfo } from "../tiktok-ui";
import { chance, jitter } from "../random";
import { matchComment } from "../commentParse";

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

    // 先把所有点赞做完：回复会弹键盘、滚动评论面板，导致点赞坐标失效，
    // 所以「先赞后回」，让点赞坐标在整个点赞阶段保持有效。
    let liked = 0;
    for (const c of comments) {
      if (ctx.shouldStop() || liked >= mp.commentLikeMaxCount) break;
      if (chance(mp.commentLikeProb)) {
        await ui.likeComment(c);
        stats.commentLikes++;
        liked++;
        await ctx.sleep(jitter(params.clickWaitTime));
      }
    }

    // 再统一回复（回复点的是固定输入框，不依赖评论坐标）。
    // postReplies=false（默认）时只生成并在日志里预览、不真发，便于先验证语言/质量。
    let replied = 0;
    for (const c of comments) {
      if (ctx.shouldStop() || replied >= mp.commentReplyMaxCount) break;
      // #3：配了"评论匹配词" → 只回复命中的评论作者；没配 → 沿用旧行为（按概率回复）。
      const matchedKw = matchComment(c.text, params.commentMatchKeywords);
      if (params.commentMatchKeywords.length > 0 && !matchedKw) continue;
      if (chance(mp.commentReplyProb)) {
        const text = await gen.reply({
          videoCaption: video.caption,
          targetComment: c.text,
          author: c.author ? `@${c.author}` : undefined,
          keyword: matchedKw ?? undefined,
        });
        if (!text) break; // 回复列表为空 → 不发、不预览
        if (params.postReplies) {
          await ui.replyComment(c, text);
          stats.commentReplies++;
        } else {
          ctx.logger.log(
            "info",
            `（回复预览·未发送${c.author ? " @" + c.author : ""}）：${text}`,
          );
        }
        replied++;
        await ctx.sleep(jitter(params.clickWaitTime));
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
