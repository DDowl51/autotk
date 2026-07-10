// @auto/plugin-tiktok — TikTok 插件。依赖 @auto/core(core 不认识它)。
import type { Plugin, RunContext } from "@auto/core";
import { defaultParams, validateParams } from "./params";
import { activation, targets } from "./targets";
import { searchWorkflow } from "./workflows/search";

export * from "./params";
export { targets, activation, pageHazards } from "./targets";
export { searchWorkflow } from "./workflows/search";
export { interactWithVideo } from "./workflows/common";

export const tiktokPlugin: Plugin = {
  id: "tiktok",
  appId: "com.zhiliaoapp.musically",
  targets,
  activation,
  workflows: {
    search: (ctx: RunContext) => searchWorkflow(ctx),
  },
  defaultParams,
  validateParams,
};

export default tiktokPlugin;
