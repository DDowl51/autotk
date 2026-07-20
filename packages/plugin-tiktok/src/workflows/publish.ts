// 发布:本工作流只做 TikTok 内的 UI 操作(+→上传→选相册最新→下一步→文案→发布),
// **前提是视频已在相册最新一条**。谁把视频放进相册?见决策记录 D9——iOS 不允许非 App 写相册,
// 故每台装一个极小「收视频 App」下载+存相册(WDA 干不了);master 发布编排(T8)负责先确保视频到位再调本工作流。
// 语义见 docs/specs/L3-业务规格.md/§7.6。权限窗(相机/麦克风/相册)由 publish 页 hazards 的 allow 处理。
import type { RunContext, Step } from "@auto/core";
import { recoverToFeed } from "./recover";

export interface PublishInput {
  caption: string;
}
export type PublishResult = "published" | "failed";

function step(intent: string, act: Step["act"], expected: string[], verify: string[], hazards: string[], timeout = 15000): Step {
  return { intent, act, expected, hazards, verify, timeout, onFail: [{ kind: "retry", times: 1 }, { kind: "alertOperator", message: `发布步失败: ${intent}` }] };
}

/**
 * 发布一条视频。publishHazards = pageHazards("publish")(含相机/麦克风/相册权限 allow)。
 * 返回 published/failed 供 Hub 回报。
 */
export async function publish(ctx: RunContext, input: PublishInput, publishHazards: string[], feedHazards: string[]): Promise<PublishResult> {
  // 0) 先回基地(能看到底部 [+] 的干净推荐流)——从任意深页复位;回不去就放弃,绝不从深页盲发。
  if (!(await recoverToFeed(ctx))) {
    ctx.log("[发布] 回基地失败,放弃");
    return "failed";
  }
  // 1) 点 [+] → 相机/上传页
  if ((await ctx.runStep(step("点+创建", { kind: "tapTarget", target: "publish.plus" }, ["publish.plus"], ["publish.upload"], feedHazards))).status !== "ok") return "failed";
  // 2) 上传/相册入口 → 相册
  if ((await ctx.runStep(step("开相册", { kind: "tapTarget", target: "publish.upload" }, ["publish.upload"], ["publish.album-first"], publishHazards))).status !== "ok") return "failed";
  // 3) 选相册最新一条 → 编辑/下一步
  if ((await ctx.runStep(step("选最新视频", { kind: "tapTarget", target: "publish.album-first" }, ["publish.album-first"], ["publish.next"], publishHazards))).status !== "ok") return "failed";
  // 4) 下一步 → 文案页
  if ((await ctx.runStep(step("下一步", { kind: "tapTarget", target: "publish.next" }, ["publish.next"], ["publish.caption"], publishHazards))).status !== "ok") return "failed";
  // 5) 输入文案 → 出现发布按钮
  if ((await ctx.runStep(step("输入文案", { kind: "typeInto", target: "publish.caption", text: input.caption }, ["publish.caption"], ["publish.post"], publishHazards))).status !== "ok") return "failed";
  // 6) 发布 → 回到信息流 = 成功
  if ((await ctx.runStep(step("发布", { kind: "tapTarget", target: "publish.post" }, ["publish.post"], ["feed.rail"], publishHazards, 30000))).status !== "ok") return "failed";
  ctx.log(`[发布] 成功:${input.caption.slice(0, 20)}`);
  return "published";
}
