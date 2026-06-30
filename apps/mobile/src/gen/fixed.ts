import type { CommentGenerator } from "../engine/types";
import { pick } from "../engine/random";

const EMOJIS = ["😍", "🔥", "💯", "👍", "✨", "😂", "🙌", "🥰"];

/**
 * 展开回复模板里的占位符：
 *  - `{a|b|c}` → 随机择一（一条模板生多种说法）
 *  - `{emoji}` → 随机一个友好表情（可写多个）
 *  - `{user}`  → 评论作者 @用户名（#3 针对性回复时填入；无则空）
 *  - `{kw}`    → 命中的关键词（#3 用；无则空）
 * 末尾归一化空格（占位符为空时清理多余空格）。
 */
export function expandPlaceholders(
  tpl: string,
  ctx: { user?: string; keyword?: string } = {},
): string {
  return tpl
    .replace(/\{([^{}]*\|[^{}]*)\}/g, (_m, opts: string) => pick(opts.split("|"))?.trim() ?? "")
    .replace(/\{emoji\}/g, () => pick(EMOJIS) ?? "")
    .replace(/\{user\}/g, ctx.user ?? "")
    .replace(/\{kw\}/g, ctx.keyword ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 固定回复生成器：从配置的回复列表里随机取一条，展开占位符。
 * 列表为空 → 返回空串（上层不发/不预览，避免发空评论）。
 */
export function createFixedReplyGenerator(replies: string[]): CommentGenerator {
  return {
    reply: async (input) => {
      const tpl = pick(replies);
      if (!tpl) return "";
      return expandPlaceholders(tpl, { user: input.author, keyword: input.keyword });
    },
  };
}
