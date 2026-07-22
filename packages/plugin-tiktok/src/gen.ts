// 话术生成(移植旧 gen/fixed.ts):固定模板 + 占位符展开。评论回复与私信共用。
export type Rng = () => number;

const EMOJIS = ["😍", "🔥", "💯", "👍", "✨", "😂", "🙌", "🥰"];

export interface ReplyVars {
  user?: string; // 评论作者 @用户名
  keyword?: string; // 命中的关键词
}

/**
 * 展开一条模板:
 * - {a|b|c} 竖线随机择一;{emoji} 随机表情;{user}/{kw} 变量;最后归一化空格。
 */
export function expandPlaceholders(tpl: string, vars: ReplyVars, rng: Rng): string {
  const pickOpt = (opts: string[]): string => opts[Math.floor(rng() * opts.length)] ?? "";
  return tpl
    .replace(/\{([^{}]*\|[^{}]*)\}/g, (_m, group: string) => pickOpt(group.split("|")))
    .replace(/\{emoji\}/g, () => EMOJIS[Math.floor(rng() * EMOJIS.length)])
    .replace(/\{user\}/g, vars.user ?? "")
    .replace(/\{kw\}/g, vars.keyword ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 从模板列表随机取一条并展开。空列表 → ""(上层不发/不预览,避免空评论)。 */
export function genReply(templates: string[], vars: ReplyVars, rng: Rng): string {
  if (templates.length === 0) return "";
  const tpl = templates[Math.floor(rng() * templates.length)] ?? templates[0];
  return expandPlaceholders(tpl, vars, rng);
}
