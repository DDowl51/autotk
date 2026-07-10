// 私信动作:从主页视频评论里挑人 → 进他主页 → 私信。带去重(跨天)+ 每日限量。
// ⚠️ 平台风险最高(私信按钮是否存在 + TikTok 反垃圾),navigation 需真机调,但去重/限量/cant 逻辑离线可测。
import type { RunContext, Step } from "@auto/core";
import type { Comment } from "../comments";
import type { DmParams } from "../params";
import { genReply } from "../gen";
import { COMMENT_REGION, snippet } from "./comments";

export type DmResult = "sent" | "skip-dedup" | "capped" | "cant" | "no-avatar";

const DM_NS = (account: string) => `dm:${account}`;
const DM_TRIED_NS = (account: string) => `dm-tried:${account}`;
const DM_COUNT_NS = "dm-count";

/** 从左边缘右滑返回(退出对方主页/私信页,回我的主页视频)。 */
function backGesture(ctx: RunContext): Promise<void> {
  const { width: w, height: h } = ctx.size;
  return ctx.swipe({ x: 3, y: h * 0.5 }, { x: w * 0.78, y: h * 0.5 }, 200);
}

/**
 * 给一条评论的作者发私信。调用前应已确认:命中 DM 关键词、在评论区。
 * 顺序:查去重/配额 → 点头像进主页 → 有私信按钮才发 → 记去重+计数 → 返回。
 */
export async function dmCommenter(ctx: RunContext, c: Comment, account: string, dm: DmParams): Promise<DmResult> {
  const user = c.author;
  if (await ctx.state.has(DM_NS(account), user)) return "skip-dedup"; // 已私信过
  if ((await ctx.state.peekDaily(DM_COUNT_NS, account)) >= dm.dmDailyCap) return "capped"; // 到每日上限

  // 点评论者头像 → 进他主页
  if (!(await ctx.findAndTap(`the profile avatar of the comment that says "${snippet(c.text)}"`, COMMENT_REGION))) {
    return "no-avatar";
  }
  // 对方主页有没有私信按钮?(隐私设置可能没有)
  const btn = await ctx.locate(["dm.message-button"]);
  if (!btn.has("dm.message-button")) {
    await ctx.state.add(DM_TRIED_NS(account), user); // 记「试过发不了」,免反复进主页
    await backGesture(ctx);
    return "cant";
  }

  // 点私信按钮 → 出现输入框 → 输入话术 → 发送
  const openChat: Step = {
    intent: "打开私信",
    act: { kind: "tapTarget", target: "dm.message-button" },
    expected: ["dm.message-button"],
    hazards: [],
    verify: ["dm.input"],
    timeout: 8000,
    onFail: [{ kind: "retry", times: 1 }, { kind: "alertOperator", message: "打开私信失败" }],
  };
  if ((await ctx.runStep(openChat)).status !== "ok") {
    await backGesture(ctx);
    return "cant";
  }
  const text = genReply(dm.dmTemplates, { user }, () => ctx.random());
  if (text) {
    const typeStep: Step = {
      intent: "输入私信",
      act: { kind: "typeInto", target: "dm.input", text },
      expected: ["dm.input"],
      hazards: [],
      verify: ["dm.send"],
      timeout: 6000,
      onFail: [{ kind: "alertOperator", message: "私信输入失败" }],
    };
    if ((await ctx.runStep(typeStep)).status === "ok") {
      await ctx.tapTarget("dm.send");
      ctx.stats.dmSent++;
    }
  }
  // 记去重 + 每日计数(无论话术是否空都记已私信过,避免下次重进)
  await ctx.state.add(DM_NS(account), user);
  await ctx.state.incrDaily(DM_COUNT_NS, account);
  // 返回我的主页视频评论区(私信页 → 对方主页 → 我的视频)
  await backGesture(ctx);
  await backGesture(ctx);
  return "sent";
}
