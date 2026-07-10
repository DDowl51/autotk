// 搜索工作流:点放大镜 → 输入关键词 → 提交 → 点第二个结果(跳广告位)→ 遍历结果视频互动。
// 语义见 docs/specs/L3-业务规格.md §6.2。导航步用 Step 合同(verify 轮询替代死 sleep)。
import type { RunContext, Step } from "@auto/core";
import type { TikTokParams } from "../params";
import { pageHazards } from "../targets";
import { interactWithVideo } from "./common";

const SEARCH_HZ = pageHazards("search");
const FEED_HZ = pageHazards("feed");

/** 建一个「点某目标」的导航步。 */
function tapStep(intent: string, target: string, expected: string[], verify: string[], hazards: string[]): Step {
  return {
    intent,
    act: { kind: "tapTarget", target },
    expected,
    hazards,
    verify,
    timeout: 12000, // 搜索结果加载慢,给足
    onFail: [{ kind: "retry", times: 1 }, { kind: "recover" }, { kind: "alertOperator", message: `搜索步失败: ${intent}` }],
  };
}

export async function searchWorkflow(ctx: RunContext, maxResults = 5): Promise<void> {
  const p = ctx.params as TikTokParams;
  const mp = p.kwSearch;
  const kw = ctx.pick(p.searchKeywords);
  if (!kw) {
    ctx.log("[搜索页] 无搜索关键词,跳过");
    return;
  }
  ctx.log(`[搜索页] 搜索「${kw}」`);

  // 1) 点放大镜 → 出现搜索输入框
  if ((await ctx.runStep(tapStep("点放大镜", "nav.search-icon", ["feed.rail"], ["search.input"], FEED_HZ))).status !== "ok") return;
  // 2) 输入关键词 → 出现提交按钮
  const typeStep: Step = {
    intent: "输入关键词",
    act: { kind: "typeInto", target: "search.input", text: kw },
    expected: ["search.input"],
    hazards: SEARCH_HZ,
    verify: ["search.submit"],
    timeout: 8000,
    onFail: [{ kind: "retry", times: 1 }, { kind: "alertOperator", message: "输入关键词失败" }],
  };
  if ((await ctx.runStep(typeStep)).status !== "ok") return;
  // 3) 提交 → 出现结果列表
  if ((await ctx.runStep(tapStep("提交搜索", "search.submit", ["search.submit"], ["search.results"], SEARCH_HZ))).status !== "ok") return;
  // 4) 点第二个结果(跳过第一个广告位)→ 进入结果视频流
  if ((await ctx.runStep(tapStep("开第二个结果", "search.result-2", ["search.results"], ["feed.rail"], SEARCH_HZ))).status !== "ok") return;

  // 5) 遍历结果视频互动(搜索结果默认对标,不做 pos/neg 筛选)
  for (let i = 0; i < maxResults; i++) {
    if (ctx.shouldStop() || !ctx.withinWindow()) break;
    ctx.stats.videosWatched++;
    await interactWithVideo(ctx, mp);
    await ctx.sleepSeconds(ctx.jitter(2));
    if (i < maxResults - 1) {
      // 盲滑到下一个结果(swipeNext 前置危险检测由 Step.hazards 完成)
      const next: Step = {
        intent: "下一个结果",
        act: { kind: "swipeNext" },
        expected: ["feed.rail"],
        hazards: FEED_HZ,
        verify: ["feed.rail"],
        timeout: 8000,
        onFail: [{ kind: "recover" }, { kind: "alertOperator", message: "切下一个结果失败" }],
      };
      if ((await ctx.runStep(next)).status !== "ok") break;
    }
  }
  ctx.log("[搜索页] 结束");
}
