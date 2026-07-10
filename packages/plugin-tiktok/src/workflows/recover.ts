// 回基地(L3 §3.2-4):确认在推荐流;不在则 iOS 边缘右滑逐级退,退不出=失败。
// 探测走 Step 合同(纯观察步)——危险弹窗在探测中被顺手处理,不会挡死。
import type { RunContext, Step } from "@auto/core";
import { pageHazards } from "../targets";

const FEED_HZ = pageHazards("feed");

function probeStep(): Step {
  return {
    intent: "确认在推荐流",
    expected: ["feed.rail"],
    hazards: FEED_HZ,
    verify: [],
    timeout: 4000,
    onFail: [{ kind: "alertOperator", message: "不在推荐流" }],
  };
}

/** 回推荐流基地。返回是否成功;不上抛(调用方决定升级)。 */
export async function recoverToFeed(ctx: RunContext, maxBacks = 3): Promise<boolean> {
  for (let i = 0; i <= maxBacks; i++) {
    if (ctx.shouldStop()) return false;
    const r = await ctx.runStep(probeStep());
    if (r.status === "ok") return true;
    if (r.status === "stopped") return false;
    if (i < maxBacks) {
      // iOS 边缘右滑返回(与引擎 backGesture 同手势)
      await ctx.swipe(
        { x: 0.02 * ctx.size.width, y: 0.5 * ctx.size.height },
        { x: 0.78 * ctx.size.width, y: 0.5 * ctx.size.height },
        200,
      );
      await ctx.sleepSeconds(ctx.jitter(1));
    }
  }
  ctx.log("回基地失败:退不回推荐流");
  return false;
}

/** 工作流包装:失败抛错 → core 批异常走退避自愈。 */
export async function recoverWorkflow(ctx: RunContext): Promise<void> {
  if (!(await recoverToFeed(ctx))) throw new Error("回基地失败:退不回推荐流");
}
