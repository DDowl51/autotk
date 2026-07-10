// 评论区能力:读评论 + 下滑加载更多 + 去重到底检测。多工作流复用。
import type { RunContext } from "@auto/core";
import { commentKey, parseComments, type Comment } from "../comments";

// 评论区文本区域(避开顶部缩略图/底部输入栏)。
const COMMENT_REGION: readonly [number, number, number, number] = [0, 0.27, 0.78, 0.86];

/** 读当前屏评论。 */
export async function readComments(ctx: RunContext): Promise<Comment[]> {
  const lines = await ctx.readLines(COMMENT_REGION);
  return parseComments(lines);
}

/**
 * 下滑加载更多评论:面板内竖直上滑 → 重读 → 去重;连续两屏无新评论=到底。
 * 返回按出现顺序去重后的评论列表。
 */
export async function scrollComments(ctx: RunContext, maxScrolls = 4): Promise<Comment[]> {
  const seen = new Map<string, Comment>();
  let dry = 0;
  for (let i = 0; i < maxScrolls; i++) {
    if (ctx.shouldStop()) break;
    let fresh = 0;
    for (const c of await readComments(ctx)) {
      const k = commentKey(c);
      if (k && !seen.has(k)) {
        seen.set(k, c);
        fresh++;
      }
    }
    if (fresh === 0) {
      if (++dry >= 2) break; // 到底
    } else {
      dry = 0;
    }
    // 面板内纯竖直上滑一屏(不误触链接/进外部)。
    const { width: w, height: h } = ctx.size;
    await ctx.swipe({ x: w * 0.5, y: h * 0.7 }, { x: w * 0.5, y: h * 0.38 }, 300);
    await ctx.sleepSeconds(ctx.jitter(1));
  }
  return [...seen.values()];
}
