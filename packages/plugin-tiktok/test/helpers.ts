import { createRunContext, emptyStats, toRegistry, type RunContext, type Rng } from "@auto/core";
import { activation, targets } from "../src/targets";
import { defaultParams, type TikTokParams } from "../src/params";
import { FakeApp, memStore } from "./fake";

/** 组一个跑在 FakeApp 上的 RunContext。rng 默认恒 0(所有正概率动作都触发,便于断言)。 */
export function makeCtx(app: FakeApp, over: Partial<TikTokParams> = {}, rng: Rng = () => 0): { ctx: RunContext } {
  const ctx = createRunContext({
    driver: app.driver,
    perceptor: app.perceptor,
    targets: toRegistry(targets),
    size: app.size,
    now: app.now,
    sleep: app.sleep,
    shouldStop: app.shouldStop,
    pollMs: 50,
    globalHazards: activation.globalHazards,
    params: { ...defaultParams, ...over },
    state: memStore(),
    stats: emptyStats(),
    withinWindow: () => true,
    rng,
  });
  return { ctx };
}
