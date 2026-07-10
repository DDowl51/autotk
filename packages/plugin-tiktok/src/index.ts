// @auto/plugin-tiktok — TikTok 插件。依赖 @auto/core(core 不认识它)。
import type { Plugin, RunContext } from "@auto/core";
import { defaultParams, validateParams } from "./params";
import { activation, pageHazards, targets } from "./targets";
import { searchWorkflow } from "./workflows/search";
import { profileAndDM } from "./workflows/profile";
import { followMonitor } from "./workflows/following";

export * from "./params";
export { targets, activation, pageHazards } from "./targets";
export { searchWorkflow } from "./workflows/search";
export { profileAndDM } from "./workflows/profile";
export { followMonitor } from "./workflows/following";
export { publish, type PublishInput, type PublishResult } from "./workflows/publish";
export { dmCommenter } from "./workflows/dm";
export { interactWithVideo } from "./workflows/common";
export { readComments, scrollComments, interactComments } from "./workflows/comments";

export const tiktokPlugin: Plugin = {
  id: "tiktok",
  appId: "com.zhiliaoapp.musically",
  targets,
  activation,
  workflows: {
    search: (ctx: RunContext) => searchWorkflow(ctx),
    profileAndDM: (ctx: RunContext) => profileAndDM(ctx, pageHazards("profile"), pageHazards("feed")),
    followMonitor: (ctx: RunContext) => followMonitor(ctx, pageHazards("feed")),
    // publish 由 Hub 任务驱动(带 input),不在无参 workflows 映射里——见 export publish。
  },
  defaultParams,
  validateParams,
};

export default tiktokPlugin;
