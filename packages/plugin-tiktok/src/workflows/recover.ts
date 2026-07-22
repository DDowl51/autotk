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
    // 双锚点(任一命中即算在流):心形点赞键(feed.rail)+ 顶部 For You 文字。
    // 单靠一个 phrase 万一 grounding 抓不住就误判"不在流"→ 乱脱困(真机教训 2026-07-21)。
    expected: ["feed.rail", "nav.foryou-tab"],
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
      // 评论区开着(用具体的「评论输入框」判,不用抽象的「面板」——后者易被幻觉)→ 竖直下滑关;
      // 否则当 pushed 页 → 边缘右滑退(在推荐流上右滑无害,而下滑会触发下拉刷新,故不确定时优先右滑)。
      if ((await ctx.locate(["comments.input"])).has("comments.input")) {
        ctx.log("回基地:评论区开着 → 竖直下滑关");
        await ctx.swipe({ x: 0.5 * w, y: 0.35 * h }, { x: 0.5 * w, y: 0.96 * h }, 250);
      } else {
        ctx.log("回基地:pushed 页 → 边缘右滑退一级");
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
