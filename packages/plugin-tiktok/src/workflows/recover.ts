// 回基地(L3 §3.2-4):确认在推荐流;不在则逐级脱困。多策略——
//   ① 危险弹窗:探测步 hazards 顺手处理(权限窗/购物卡/内嵌网页/分享面板)。
//   ② 评论面板(浮层):竖直下滑关(边缘右滑关不掉它,养号最常停这里)。
//   ③ 其它 pushed 页(搜索/主页/私信):iOS 边缘右滑逐级退。
// 退不出 = 失败,由调用方升级为 alertOperator(绝不盲动乱滑,坑清单 D1)。
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
export async function recoverToFeed(ctx: RunContext, maxSteps = 6): Promise<boolean> {
  const { width: w, height: h } = ctx.size;
  for (let i = 0; i <= maxSteps; i++) {
    if (ctx.shouldStop()) return false;
    const r = await ctx.runStep(probeStep());
    if (r.status === "ok") return true;
    if (r.status === "stopped") return false;
    if (i < maxSteps) {
      // 评论面板在场 → 竖直下滑关(浮层,边缘右滑无效);否则当 pushed 页 → 边缘右滑退。
      if ((await ctx.locate(["comments.panel"])).has("comments.panel")) {
        await ctx.swipe({ x: 0.5 * w, y: 0.35 * h }, { x: 0.5 * w, y: 0.96 * h }, 250);
      } else {
        await ctx.swipe({ x: 0.02 * w, y: 0.5 * h }, { x: 0.78 * w, y: 0.5 * h }, 200);
      }
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
