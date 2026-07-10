// @auto/plugin-tiktok — TikTok 插件。依赖 @auto/core(core 不认识它)。
import type { Plugin, RunContext } from "@auto/core";
import { defaultParams, validateParams } from "./params";
import { activation, pageHazards, targets } from "./targets";
import { searchWorkflow } from "./workflows/search";
import { profileAndDM } from "./workflows/profile";

export * from "./params";
export { targets, activation, pageHazards } from "./targets";
export { searchWorkflow } from "./workflows/search";
export { profileAndDM } from "./workflows/profile";
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
  },
  defaultParams,
  validateParams,
};

export default tiktokPlugin;
