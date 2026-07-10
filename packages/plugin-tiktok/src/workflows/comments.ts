// 评论区能力:读评论 + 下滑加载更多 + 去重到底检测 + 逐条点赞/回复。多工作流复用。
import type { RunContext, Step } from "@auto/core";
import { commentKey, matchComment, parseComments, type Comment } from "../comments";
import type { ModuleParams } from "../params";
import { genReply } from "../gen";

// 评论区文本区域(避开顶部缩略图/底部输入栏)。
export const COMMENT_REGION: readonly [number, number, number, number] = [0, 0.27, 0.78, 0.86];

/** 评论文本片段,拼进动态定位短语(去引号防拼接歧义)。 */
export function snippet(text: string): string {
  return text.replace(/["'\n]/g, " ").trim().slice(0, 24);
}

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

export interface CommentOpts {
  matchKeywords: string[]; // 空=不筛选(按概率回复);非空=只回复命中的
  replyTemplates: string[];
  postReplies: boolean; // false=只预览不真发
  clickWaitTime: number;
}

/**
 * 逐条评论点赞/回复(先赞后回:回复会弹键盘/滚面板致点赞坐标失效)。广告评论跳过。
 * comments 由调用方 scrollComments 先收集好(DM 等其它 pass 复用同一份)。
 */
export async function interactComments(ctx: RunContext, mp: ModuleParams, comments: Comment[], o: CommentOpts): Promise<void> {
  const wait = () => ctx.sleepSeconds(ctx.jitter(o.clickWaitTime));

  // —— 点赞 ——
  let liked = 0;
  for (const c of comments) {
    if (ctx.shouldStop() || liked >= mp.commentLikeMaxCount) break;
    if (c.isAd) continue;
    if (ctx.chance(mp.commentLikeProb)) {
      if (await ctx.findAndTap(`the like heart icon to the right of the comment that says "${snippet(c.text)}"`, COMMENT_REGION)) {
        ctx.stats.commentLikes++;
        liked++;
      }
      await wait();
    }
  }

  // —— 回复 ——
  let replied = 0;
  for (const c of comments) {
    if (ctx.shouldStop() || replied >= mp.commentReplyMaxCount) break;
    if (c.isAd) continue;
    const matched = matchComment(c.text, o.matchKeywords);
    if (o.matchKeywords.length > 0 && !matched) continue; // 配了词只回命中的
    if (!ctx.chance(mp.commentReplyProb)) continue;
    const text = genReply(o.replyTemplates, { user: c.author, keyword: matched ?? undefined }, () => ctx.random());
    if (!text) break; // 话术为空 → 不发
    if (!o.postReplies) {
      // 预览模式:只生成 + 日志,不碰 UI(不在评论框留下未发文本)。
      ctx.log(`(回复预览·未发送)@${c.author}:${text}`);
      replied++;
      continue;
    }
    if (!(await ctx.findAndTap(`the Reply link under the comment that says "${snippet(c.text)}"`, COMMENT_REGION))) continue;
    const typeStep: Step = {
      intent: "输入回复",
      act: { kind: "typeInto", target: "comments.input", text },
      expected: ["comments.input"],
      hazards: [],
      verify: ["comments.send"],
      timeout: 6000,
      onFail: [{ kind: "alertOperator", message: "回复输入框未出现" }],
    };
    if ((await ctx.runStep(typeStep)).status !== "ok") continue;
    if (await ctx.tapTarget("comments.send")) ctx.stats.commentReplies++;
    replied++;
    await wait();
  }
}
