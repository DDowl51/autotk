// Plugin:一个 app 提供给 core 的全部(依赖倒置的关键接口)。core 不 import 任何插件。
import { createRunContext, emptyStats, type RunContext, type RunContextDeps } from "./context";
import type { EngineDeps } from "./engine";
import type { StateStore } from "./interfaces";
import type { Target } from "./target";

/** 目标激活规则:每步查的危险 = globalHazards ∪ pageHazards[当前页]。 */
export interface Activation {
  globalHazards: string[];
  pageHazards: Record<string, string[]>;
  pageExpected: Record<string, string[]>;
}

export interface Plugin {
  id: string;
  /** driver.activateApp 用(如 iOS bundleId)。 */
  appId: string;
  targets: Target[];
  activation: Activation;
  /** 任务名 → 工作流。 */
  workflows: Record<string, (ctx: RunContext) => Promise<void>>;
  /** 参数默认值。 */
  defaultParams: unknown;
  /** 参数校验(不合法抛错)。 */
  validateParams(p: unknown): void;
}

/** 跑一个插件工作流:装配 RunContext(并入插件全局危险)后执行。运行时/测试共用。 */
export async function runWorkflow(
  plugin: Plugin,
  name: string,
  deps: EngineDeps & {
    params: unknown;
    state: StateStore;
    withinWindow: () => boolean;
    rng?: RunContextDeps["rng"];
    stats?: RunContextDeps["stats"];
  },
): Promise<RunContext> {
  const wf = plugin.workflows[name];
  if (!wf) throw new Error(`插件 ${plugin.id} 无工作流: ${name}`);
  const ctx = createRunContext({
    ...deps,
    globalHazards: plugin.activation.globalHazards,
    stats: deps.stats ?? emptyStats(),
  });
  await wf(ctx);
  return ctx;
}
