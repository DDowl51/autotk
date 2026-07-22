# @auto/core

可复用移动端自动化框架的 **core**(app / 平台无关)。见 `docs/自动化框架-架构设计总纲.md`。

## 提供什么

- **接口(依赖倒置)**:`Driver`(L0 设备)、`Perceptor`(定位+OCR)、`StateStore`(去重/限量)、`Target`(声明式感知)、`Step`(合同)。core 定义,平台/插件实现。
- **决策引擎** `engine.ts`:
  - `decide(step, deps)` —— 一次闭环:观测 → 组合定位 → **危险优先** → 期望执行 act → **验证/轮询**(替代死 sleep)→ 超时。
  - `runStep(step, deps)` —— 升级链(retry → variants → recover → **alertOperator**,终点不盲动);危险处理算进展、重跑本步(带熔断)。
- **拟人化** `human.ts`:`chance` / `jitter` / `randInt` / `pick`(rng 可注入,确定性可测)。
- **几何** `geometry.ts`:归一化框 ↔ 像素。

## 测试

`decide`/`runStep` 全部依赖经 `EngineDeps` 注入(driver/perceptor/时钟/休眠),用 `test/fake.ts` 的假世界(可控屏上目标 + 假时钟)**完全离线、确定性**覆盖:危险优先、class 优先级、直播卡盲滑、期望轮询、验证失败、超时、retry/variants/recover、危险重跑+熔断、停止。

```bash
pnpm --filter @auto/core test        # vitest
pnpm --filter @auto/core typecheck
```

## 状态(G1)

core 决策引擎 + 接口 + 拟人化完成,21 单测全绿。L1 基本操作(tapTarget/await/…)一部分已内联在 engine;完整 L1 与插件动作层在 G3。
